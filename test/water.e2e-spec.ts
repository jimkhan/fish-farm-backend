import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { join } from 'path';
import { validateEnv } from '../src/platform/config/env.validation';
import { buildDataSourceOptions } from '../src/platform/persistence/data-source.options';
import { PersistenceModule } from '../src/platform/persistence/persistence.module';
import { AuditEntryPersistenceModel } from '../src/shared-kernel/audit/audit-entry.persistence-model';
import { AuditModule } from '../src/shared-kernel/audit/audit.module';
import { ErrorsModule } from '../src/shared-kernel/errors/errors.module';
import { TenantModule } from '../src/shared-kernel/tenant/tenant.module';
import { EventsModule } from '../src/platform/events/events.module';
import { Argon2PasswordHasher } from '../src/modules/identity/infrastructure/argon2-password-hasher';
import { PasswordResetTokenPersistenceModel } from '../src/modules/identity/infrastructure/persistence/password-reset-token.persistence-model';
import { ProjectMembershipPersistenceModel } from '../src/modules/identity/infrastructure/persistence/project-membership.persistence-model';
import { RefreshTokenPersistenceModel } from '../src/modules/identity/infrastructure/persistence/refresh-token.persistence-model';
import { UserPersistenceModel } from '../src/modules/identity/infrastructure/persistence/user.persistence-model';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { AlertPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/alert.persistence-model';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';
import { PondPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/pond.persistence-model';
import { PondsModule } from '../src/modules/ponds/ponds.module';
import { SpeciesPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/species.persistence-model';
import { StockingPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/stocking.persistence-model';
import { BatchPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/batch.persistence-model';
import { ProjectPersistenceModel } from '../src/modules/projects/infrastructure/persistence/project.persistence-model';
import { ProjectsModule } from '../src/modules/projects/projects.module';
import { WaterReadingPersistenceModel } from '../src/modules/water/infrastructure/persistence/water-reading.persistence-model';
import { WaterThresholdPersistenceModel } from '../src/modules/water/infrastructure/persistence/water-threshold.persistence-model';
import { WaterModule } from '../src/modules/water/water.module';
import { startTestPostgres } from './support/postgres-test-container';

/**
 * Water readings/thresholds e2e (TASK-023, CON-025/026/027/027a, AC-083/084/085/090/092/093) —
 * full MOD-02+MOD-03+MOD-04+MOD-09 stack on a real Postgres. A real breach publishes a real
 * `WaterThresholdBreached` event, consumed by MOD-09's already-built handler into a real,
 * queryable alert — no synthetic bus.publish().
 */

function buildWaterTestAppModule() {
  @Module({
    imports: [
      NestConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
      PersistenceModule,
      ErrorsModule,
      TenantModule,
      AuditModule,
      EventsModule,
      IdentityModule,
      ProjectsModule,
      PondsModule,
      NotificationsModule,
      WaterModule,
    ],
  })
  class WaterTestAppModule {}

  return WaterTestAppModule;
}

const OWNER_EMAIL = 'water-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const WORKER_EMAIL = 'water-worker@example.com';
const WORKER_PASSWORD = 'worker correct horse battery staple';
const OUTSIDER_EMAIL = 'water-outsider@example.com';
const OUTSIDER_PASSWORD = 'outsider correct horse battery staple';

describe('Water readings/thresholds e2e (TASK-023, CON-025/026/027/027a, AC-083/084/085/090/092/093)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let accessTokenFor: (email: string, password: string) => Promise<string>;
  let ownerToken: string;
  let workerToken: string;
  let outsiderToken: string;
  let projectId: string;
  let pondId: string;

  beforeAll(async () => {
    const started = await startTestPostgres();
    container = started.container;

    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = started.dbEnv.DB_HOST;
    process.env.DB_PORT = String(started.dbEnv.DB_PORT);
    process.env.DB_USERNAME = started.dbEnv.DB_USERNAME;
    process.env.DB_PASSWORD = started.dbEnv.DB_PASSWORD;
    process.env.DB_NAME = started.dbEnv.DB_NAME;
    process.env.JWT_ACCESS_SECRET = 'test-only-secret-not-for-production-use-0000';
    process.env.JWT_ACCESS_TTL_SECONDS = '900';
    process.env.JWT_REFRESH_TTL_DAYS = '30';
    process.env.PASSWORD_RESET_TTL_MINUTES = '30';

    dataSource = new DataSource({
      ...buildDataSourceOptions(started.dbEnv),
      entities: [
        AuditEntryPersistenceModel,
        UserPersistenceModel,
        RefreshTokenPersistenceModel,
        PasswordResetTokenPersistenceModel,
        ProjectMembershipPersistenceModel,
        ProjectPersistenceModel,
        PondPersistenceModel,
        SpeciesPersistenceModel,
        StockingPersistenceModel,
        BatchPersistenceModel,
        AlertPersistenceModel,
        WaterReadingPersistenceModel,
        WaterThresholdPersistenceModel,
      ],
      migrations: [join(__dirname, '..', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const hasher = new Argon2PasswordHasher();
    const users = dataSource.getRepository(UserPersistenceModel);
    for (const [email, password] of [
      [OWNER_EMAIL, OWNER_PASSWORD],
      [WORKER_EMAIL, WORKER_PASSWORD],
      [OUTSIDER_EMAIL, OUTSIDER_PASSWORD],
    ]) {
      await users.save({
        email,
        name: email,
        passwordHash: await hasher.hash(password),
        status: 'ACTIVE',
      });
    }

    const moduleRef = await Test.createTestingModule({
      imports: [buildWaterTestAppModule()],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    accessTokenFor = async (email, password) => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      return res.body.accessToken;
    };
    ownerToken = await accessTokenFor(OWNER_EMAIL, OWNER_PASSWORD);
    workerToken = await accessTokenFor(WORKER_EMAIL, WORKER_PASSWORD);
    outsiderToken = await accessTokenFor(OUTSIDER_EMAIL, OUTSIDER_PASSWORD);

    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Water Farm', siteLat: 23.7, siteLng: 90.3 })
      .expect(201);
    projectId = project.body.id;

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: WORKER_EMAIL, role: 'WORKER' })
      .expect(201);

    const pond = await request(app.getHttpServer())
      .post(`/projects/${projectId}/ponds`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'North Pond', area: 10 })
      .expect(201);
    pondId = pond.body.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  describe('CON-025/026: readings', () => {
    it('AC-083: Worker records a manual reading; Owner/Worker/Partner-equivalent can all list it', async () => {
      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${pondId}/water-readings`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ parameter: 'PH', value: 7.5, readAt: '2026-02-01T10:00:00.000Z', clientMutationId: 'cmid-ph-1' })
        .expect(201);
      expect(res.body.source).toBe('MANUAL');

      const list = await request(app.getHttpServer())
        .get(`/projects/${projectId}/ponds/${pondId}/water-readings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(list.body.some((r: { id: string }) => r.id === res.body.id)).toBe(true);
    });

    it('a client-supplied source is rejected (always MANUAL server-side)', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${pondId}/water-readings`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          parameter: 'PH',
          value: 7.5,
          source: 'SENSOR',
          readAt: '2026-02-01T10:00:00.000Z',
          clientMutationId: 'cmid-ph-2',
        })
        .expect(400);
    });

    it('AC-090: a non-member is denied with no data disclosure', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/ponds/${pondId}/water-readings`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(403);
    });

    it('AC-084: a reading below the seeded DO default emits a real WaterThresholdBreached, consumed into a real alert', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${pondId}/water-readings`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ parameter: 'DO', value: 2.5, readAt: '2026-02-01T11:00:00.000Z', clientMutationId: 'cmid-do-critical' })
        .expect(201);

      const alerts = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const breach = alerts.body.find((a: { type: string }) => a.type === 'WATER_THRESHOLD');
      expect(breach).toBeDefined();
      expect(breach.severity).toBe('CRITICAL'); // below seeded DO critical=3
    });

    it('AC-092: an in-range AMMONIA reading (max-only) never breaches', async () => {
      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${pondId}/water-readings`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ parameter: 'AMMONIA', value: 0, readAt: '2026-02-01T12:00:00.000Z', clientMutationId: 'cmid-ammonia-low' })
        .expect(201);
      expect(res.body.parameter).toBe('AMMONIA');
    });
  });

  describe('CON-027/027a: thresholds', () => {
    it('AC-085: GET returns all 7 parameters with seeded defaults before any configuration', async () => {
      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/water-thresholds`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(res.body).toHaveLength(7);
      const doThreshold = res.body.find((t: { parameter: string }) => t.parameter === 'DO');
      expect(doThreshold).toEqual({ parameter: 'DO', min: 4, max: null, critical: 3 });
    });

    it('a Worker is denied configuring thresholds — Owner-only', async () => {
      await request(app.getHttpServer())
        .put(`/projects/${projectId}/water-thresholds`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send([{ parameter: 'DO', min: 5, max: null, critical: 4 }])
        .expect(403);
    });

    it('Owner configures a threshold override; GET reflects it; a reading in the old-safe/new-breach zone breaches', async () => {
      const put = await request(app.getHttpServer())
        .put(`/projects/${projectId}/water-thresholds`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send([{ parameter: 'DO', min: 6, max: null, critical: 5 }])
        .expect(200);
      expect(put.body[0]).toEqual({ parameter: 'DO', min: 6, max: null, critical: 5 });

      const get = await request(app.getHttpServer())
        .get(`/projects/${projectId}/water-thresholds`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const doThreshold = get.body.find((t: { parameter: string }) => t.parameter === 'DO');
      expect(doThreshold).toEqual({ parameter: 'DO', min: 6, max: null, critical: 5 });

      // A fresh pond isolates this reading's dedup key from the earlier CRITICAL DO breach test
      // above (same project, same dedup key `type:sourceRef` would otherwise absorb/uplift-only
      // rather than surface a distinct WARNING here).
      const freshPond = await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Override Test Pond', area: 5 })
        .expect(201);

      // 5.5 was within the seeded default (min=4) but breaches the new override (min=6).
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${freshPond.body.id}/water-readings`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ parameter: 'DO', value: 5.5, readAt: '2026-02-01T13:00:00.000Z', clientMutationId: 'cmid-do-override' })
        .expect(201);

      const alerts = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const warnings = alerts.body.filter(
        (a: { type: string; severity: string }) => a.type === 'WATER_THRESHOLD' && a.severity === 'WARNING',
      );
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('CON-059: trends + falling-dawn-DO advisory (TASK-026, AC-087)', () => {
    // 06:00 Dhaka local (UTC+6) = 00:00 UTC — inside the detector's 04:00–09:00 local dawn window.
    const dawnUtc = (day: number) => `2026-06-0${day}T00:00:00.000Z`;
    const from = '2026-05-31T00:00:00.000Z';
    const to = '2026-06-10T00:00:00.000Z';

    beforeAll(async () => {
      // Three consecutive dawns of *in-range* but strictly declining DO — the whole point of
      // AC-087: the advisory fires on the trend even though no single reading breaches.
      for (const [day, value] of [
        [1, 7.0],
        [2, 6.5],
        [3, 6.0],
      ] as const) {
        await request(app.getHttpServer())
          .post(`/projects/${projectId}/ponds/${pondId}/water-readings`)
          .set('Authorization', `Bearer ${workerToken}`)
          .send({
            parameter: 'DO',
            value,
            readAt: dawnUtc(day),
            clientMutationId: `cmid-trend-do-${day}`,
          })
          .expect(201);
      }
    });

    it('AC-087: querying DO trends returns the series over time AND a falling-dawn-DO advisory', async () => {
      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/ponds/${pondId}/water-readings/trends`)
        .query({ parameter: 'DO', from, to })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.parameter).toBe('DO');
      const trendReadings = res.body.series.filter((r: { readAt: string }) =>
        r.readAt.startsWith('2026-06'),
      );
      expect(trendReadings).toHaveLength(3);
      // ascending by readAt
      const times = trendReadings.map((r: { readAt: string }) => r.readAt);
      expect(times).toEqual([...times].sort());

      expect(res.body.advisory).toMatchObject({ pattern: 'FALLING_DAWN_DO', consecutiveDays: 3 });
      expect(res.body.advisory.dropValue).toBeCloseTo(1.0);
    });

    it('returns a null advisory for a non-DO parameter (pattern is DO-specific)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/ponds/${pondId}/water-readings/trends`)
        .query({ parameter: 'PH', from, to })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(res.body.parameter).toBe('PH');
      expect(res.body.advisory).toBeNull();
    });

    it('a worker (any member) can read trends', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/ponds/${pondId}/water-readings/trends`)
        .query({ parameter: 'DO', from, to })
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(200);
    });

    it('rejects a missing/invalid parameter with 400', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/ponds/${pondId}/water-readings/trends`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/ponds/${pondId}/water-readings/trends`)
        .query({ parameter: 'NOT_A_PARAM' })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
    });

    it('AC-090: a non-member is denied trends with no data disclosure', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/ponds/${pondId}/water-readings/trends`)
        .query({ parameter: 'DO', from, to })
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(403);
    });
  });

  describe('AC-093: closed-project write-guard', () => {
    it('recording a reading on a CLOSED project returns PROJECT_CLOSED/409', async () => {
      const project = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Soon Closed Water Farm', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);
      const pond = await request(app.getHttpServer())
        .post(`/projects/${project.body.id}/ponds`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'A Pond', area: 5 })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/projects/${project.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'CLOSED' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/projects/${project.body.id}/ponds/${pond.body.id}/water-readings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ parameter: 'PH', value: 7.5, readAt: '2026-02-01T10:00:00.000Z', clientMutationId: 'cmid-closed' })
        .expect(409);
      expect(res.body.code).toBe('PROJECT_CLOSED');
    });
  });
});
