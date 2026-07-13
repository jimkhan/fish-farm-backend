import { randomUUID } from 'node:crypto';
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
import { BatchPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/batch.persistence-model';
import { PondPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/pond.persistence-model';
import { SpeciesPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/species.persistence-model';
import { StockingPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/stocking.persistence-model';
import { PondsModule } from '../src/modules/ponds/ponds.module';
import { ProjectPersistenceModel } from '../src/modules/projects/infrastructure/persistence/project.persistence-model';
import { ProjectsModule } from '../src/modules/projects/projects.module';
import { MortalityHealthModule } from '../src/modules/health/health.module';
import { MortalityPersistenceModel } from '../src/modules/health/infrastructure/persistence/mortality.persistence-model';
import { TreatmentPersistenceModel } from '../src/modules/health/infrastructure/persistence/treatment.persistence-model';
import { startTestPostgres } from './support/postgres-test-container';

/**
 * Mortality/Treatment e2e (TASK-028, CON-019/051, AC-094/095/100/101/105) — full MOD-02+MOD-03+
 * MOD-04+MOD-07+MOD-09 stack on a real Postgres. Unlike TASK-015/019 (which had to publish
 * synthetic events because their real producers weren't built yet), this suite proves the FULL
 * real pipeline: logging a mortality here genuinely emits `MortalityRecorded` (consumed by MOD-04)
 * and, on a spike, genuinely emits `AbnormalMortalityDetected` (consumed by MOD-09) — no fake
 * bus.publish() anywhere in this file.
 */

function buildHealthTestAppModule() {
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
      MortalityHealthModule,
    ],
  })
  class HealthTestAppModule {}

  return HealthTestAppModule;
}

const OWNER_EMAIL = 'health-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const WORKER_EMAIL = 'health-worker@example.com';
const WORKER_PASSWORD = 'worker correct horse battery staple';
const OUTSIDER_EMAIL = 'health-outsider@example.com';
const OUTSIDER_PASSWORD = 'outsider correct horse battery staple';

describe('Mortality/Treatment e2e (TASK-028, CON-019/051, AC-094/095/100/101/105)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let accessTokenFor: (email: string, password: string) => Promise<string>;
  let ownerToken: string;
  let workerToken: string;
  let outsiderToken: string;
  let goldaSpeciesId: string;
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
        MortalityPersistenceModel,
        TreatmentPersistenceModel,
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

    const golda = await dataSource
      .getRepository(SpeciesPersistenceModel)
      .findOneByOrFail({ name: 'SPF Golda' });
    goldaSpeciesId = golda.id;

    const moduleRef = await Test.createTestingModule({
      imports: [buildHealthTestAppModule()],
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
      .send({ name: 'Health Farm', siteLat: 23.7, siteLng: 90.3 })
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

  async function newBatch(count: number, stockedOn: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/projects/${projectId}/ponds/${pondId}/stockings`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ speciesId: goldaSpeciesId, count, stockedOn })
      .expect(201);
    return res.body.id;
  }

  describe('AC-094/095: log mortality (Worker), updates survival via the real event pipeline', () => {
    it('persists the mortality and reduces the batch survivalEstimate — no synthetic event publish', async () => {
      const batchId = await newBatch(1000, '2026-01-01');

      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/mortalities`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          count: 50,
          causeCategory: 'DISEASE',
          occurredAt: '2026-02-01T10:00:00.000Z',
          clientMutationId: randomUUID(),
        })
        .expect(201);
      expect(res.body.count).toBe(50);
      expect(res.body.causeCategory).toBe('DISEASE');

      const batch = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(batch.body.cumulativeMortality).toBe(50);
      expect(batch.body.survivalEstimate).toBe(950);
    });

    it('ADR-010: replaying the same clientMutationId is idempotent — no duplicate, no double count', async () => {
      const batchId = await newBatch(1000, '2026-01-01');
      const clientMutationId = randomUUID();
      const body = {
        count: 20,
        causeCategory: 'HANDLING',
        occurredAt: '2026-02-01T10:00:00.000Z',
        clientMutationId,
      };

      const first = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/mortalities`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send(body)
        .expect(201);
      const second = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/mortalities`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send(body)
        .expect(201);
      expect(second.body.id).toBe(first.body.id);

      const batch = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(batch.body.cumulativeMortality).toBe(20);
    });

    it('a non-positive count is rejected (400)', async () => {
      const batchId = await newBatch(1000, '2026-01-01');
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/mortalities`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          count: 0,
          causeCategory: 'DISEASE',
          occurredAt: '2026-02-01T10:00:00.000Z',
          clientMutationId: randomUUID(),
        })
        .expect(400);
    });
  });

  describe('AC-105: tenant isolation', () => {
    it('denies a non-member with no data disclosure', async () => {
      const batchId = await newBatch(1000, '2026-01-01');
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/mortalities`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({
          count: 5,
          causeCategory: 'DISEASE',
          occurredAt: '2026-02-01T10:00:00.000Z',
          clientMutationId: randomUUID(),
        })
        .expect(403);
    });
  });

  describe('AC-100: a real spike raises a real alert (no synthetic bus.publish)', () => {
    it('7 quiet days then a big spike emits AbnormalMortalityDetected, consumed into a real alert', async () => {
      const batchId = await newBatch(5000, '2025-12-01');

      // Trailing baseline: 1/day for 7 days (2026-01-25 .. 2026-01-31).
      for (let day = 25; day <= 31; day += 1) {
        await request(app.getHttpServer())
          .post(`/projects/${projectId}/batches/${batchId}/mortalities`)
          .set('Authorization', `Bearer ${workerToken}`)
          .send({
            count: 1,
            causeCategory: 'UNKNOWN',
            occurredAt: `2026-01-${String(day).padStart(2, '0')}T09:00:00.000Z`,
            clientMutationId: randomUUID(),
          })
          .expect(201);
      }

      // Spike day: 2026-02-01, far above baseline*3.
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/mortalities`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          count: 200,
          causeCategory: 'DISEASE',
          occurredAt: '2026-02-01T09:00:00.000Z',
          clientMutationId: randomUUID(),
        })
        .expect(201);

      const alerts = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const spikeAlert = alerts.body.find(
        (a: { type: string; sourceRef?: string }) => a.type === 'ABNORMAL_MORTALITY',
      );
      expect(spikeAlert).toBeDefined();
      expect(spikeAlert.severity).toBe('WARNING');
      expect(spikeAlert.state).not.toBe('RESOLVED');
    });
  });

  describe('CON-051/AC-101: treatments', () => {
    it('Owner records a treatment; the withdrawal window is derivable from the response', async () => {
      const batchId = await newBatch(1000, '2026-01-01');
      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/treatments`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          product: 'Oxytetracycline',
          dose: '50mg/kg',
          administeredOn: '2026-03-01',
          withdrawalDays: 14,
        })
        .expect(201);

      expect(res.body.batchId).toBe(batchId);
      expect(res.body.withdrawalDays).toBe(14);
      expect(res.body.exportSafeAfter).toBe('2026-03-15');
    });

    it('a Worker is denied — treatments are Owner-only (module doc §2.3)', async () => {
      const batchId = await newBatch(1000, '2026-01-01');
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/treatments`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          product: 'Oxytetracycline',
          dose: '50mg/kg',
          administeredOn: '2026-03-01',
          withdrawalDays: 14,
        })
        .expect(403);
    });
  });

  describe('R9: closed-project write-guard', () => {
    it('mortalities on a CLOSED project return PROJECT_CLOSED/409', async () => {
      const project = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Soon Closed Health Farm', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);
      const pond = await request(app.getHttpServer())
        .post(`/projects/${project.body.id}/ponds`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'A Pond', area: 5 })
        .expect(201);
      const stocking = await request(app.getHttpServer())
        .post(`/projects/${project.body.id}/ponds/${pond.body.id}/stockings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ speciesId: goldaSpeciesId, count: 100, stockedOn: '2026-01-01' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/projects/${project.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'CLOSED' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/projects/${project.body.id}/batches/${stocking.body.id}/mortalities`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          count: 5,
          causeCategory: 'DISEASE',
          occurredAt: '2026-02-01T10:00:00.000Z',
          clientMutationId: randomUUID(),
        })
        .expect(409);
      expect(res.body.code).toBe('PROJECT_CLOSED');
    });
  });
});
