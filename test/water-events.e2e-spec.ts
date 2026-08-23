import { randomUUID } from 'node:crypto';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
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
import { DeliveryAttemptPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/delivery-attempt.persistence-model';
import { DeviceTokenPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/device-token.persistence-model';
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
import { startTestPostgres, type DisposablePostgres } from './support/postgres-test-container';

/**
 * Emergency water-event e2e (TASK-024, CON-028, AC-086) — full MOD-02+MOD-03+MOD-04+MOD-09 stack
 * on a real Postgres. `POST /water-events` genuinely publishes `WaterEmergencyRaised`, which is
 * genuinely consumed into a real CRITICAL alert (reusing TASK-015/016/017's whole critical-alert
 * path) — no synthetic `bus.publish()` anywhere in this file.
 */

function buildWaterEventsTestAppModule() {
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
  class WaterEventsTestAppModule {}

  return WaterEventsTestAppModule;
}

const OWNER_EMAIL = 'water-events-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const WORKER_EMAIL = 'water-events-worker@example.com';
const WORKER_PASSWORD = 'worker correct horse battery staple';
const OUTSIDER_EMAIL = 'water-events-outsider@example.com';
const OUTSIDER_PASSWORD = 'outsider correct horse battery staple';

describe('Emergency water-event e2e (TASK-024, CON-028, AC-086)', () => {
  let container: DisposablePostgres;
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
        DeviceTokenPersistenceModel,
        DeliveryAttemptPersistenceModel,
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
      imports: [buildWaterEventsTestAppModule()],
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
      .send({ name: 'Water Events Farm', siteLat: 23.7, siteLng: 90.3 })
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

  describe('CON-028: raise a one-tap emergency', () => {
    it('AC-086: a Worker raises an emergency for a pond — 202, a real CRITICAL alert reaches the owner', async () => {
      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/water-events`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ pondId, note: 'DO crash, fish gasping' })
        .expect(202);
      expect(res.body.type).toBe('WATER_EMERGENCY');
      expect(res.body.severity).toBe('CRITICAL');
      expect(res.body.message).toBe('DO crash, fish gasping');

      const alerts = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const alert = alerts.body.find((a: { id: string }) => a.id === res.body.id);
      expect(alert).toBeDefined();
      expect(alert.severity).toBe('CRITICAL');
    });

    it('edge case 3: works with no pond and no note — independent of any reading', async () => {
      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/water-events`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({})
        .expect(202);
      expect(res.body.severity).toBe('CRITICAL');
      expect(res.body.message).toBeTruthy();
    });

    it('R4/R5: a repeated tap on the same pond collapses into the same active alert, not a duplicate', async () => {
      const freshPond = await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Repeat Tap Pond', area: 5 })
        .expect(201);

      const first = await request(app.getHttpServer())
        .post(`/projects/${projectId}/water-events`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ pondId: freshPond.body.id, note: 'First tap' })
        .expect(202);
      const second = await request(app.getHttpServer())
        .post(`/projects/${projectId}/water-events`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ pondId: freshPond.body.id, note: 'Second tap' })
        .expect(202);

      expect(second.body.id).toBe(first.body.id);

      const alerts = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const matching = alerts.body.filter((a: { id: string }) => a.id === first.body.id);
      expect(matching).toHaveLength(1);
    });

    it('a pond from another project (or unknown) is not found', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/water-events`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ pondId: randomUUID() })
        .expect(404);
    });

    it('denies a non-member (an outsider, never invited) with no data disclosure', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/water-events`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({})
        .expect(403);
    });
  });

  describe('R8: closed-project write-guard', () => {
    it('returns PROJECT_CLOSED/409', async () => {
      const project = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Soon Closed Water Events Farm', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/projects/${project.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'CLOSED' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/projects/${project.body.id}/water-events`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({})
        .expect(409);
      expect(res.body.code).toBe('PROJECT_CLOSED');
    });
  });
});
