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
import { BatchPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/batch.persistence-model';
import { PondPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/pond.persistence-model';
import { SpeciesPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/species.persistence-model';
import { StockingPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/stocking.persistence-model';
import { PondsModule } from '../src/modules/ponds/ponds.module';
import { ProjectPersistenceModel } from '../src/modules/projects/infrastructure/persistence/project.persistence-model';
import { ProjectsModule } from '../src/modules/projects/projects.module';
import { InventoryItemPersistenceModel } from '../src/modules/inventory/infrastructure/persistence/inventory-item.persistence-model';
import { InventoryTxnPersistenceModel } from '../src/modules/inventory/infrastructure/persistence/inventory-txn.persistence-model';
import { InventoryModule } from '../src/modules/inventory/inventory.module';
import { AlertPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/alert.persistence-model';
import { DeliveryAttemptPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/delivery-attempt.persistence-model';
import { DeviceTokenPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/device-token.persistence-model';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';
import { FeedingLogPersistenceModel } from '../src/modules/feed/infrastructure/persistence/feeding-log.persistence-model';
import { FeedModule } from '../src/modules/feed/feed.module';
import { WaterReadingPersistenceModel } from '../src/modules/water/infrastructure/persistence/water-reading.persistence-model';
import { WaterThresholdPersistenceModel } from '../src/modules/water/infrastructure/persistence/water-threshold.persistence-model';
import { PondActionPersistenceModel } from '../src/modules/water/infrastructure/persistence/pond-action.persistence-model';
import { WaterModule } from '../src/modules/water/water.module';
import { MortalityPersistenceModel } from '../src/modules/health/infrastructure/persistence/mortality.persistence-model';
import { TreatmentPersistenceModel } from '../src/modules/health/infrastructure/persistence/treatment.persistence-model';
import { MortalityHealthModule } from '../src/modules/health/health.module';
import { SamplingPersistenceModel } from '../src/modules/growth/infrastructure/persistence/sampling.persistence-model';
import { GrowthModule } from '../src/modules/growth/growth.module';
import { TaskPersistenceModel } from '../src/modules/tasks/infrastructure/persistence/task.persistence-model';
import { TaskLogPersistenceModel } from '../src/modules/tasks/infrastructure/persistence/task-log.persistence-model';
import { TasksModule } from '../src/modules/tasks/tasks.module';
import { SyncMutationPersistenceModel } from '../src/modules/sync/infrastructure/persistence/sync-mutation.persistence-model';
import { SyncModule } from '../src/modules/sync/sync.module';
import { startTestPostgres } from './support/postgres-test-container';

/**
 * Sync e2e (TASK-040, CON-040, F3, AC-129/130/131/132/137/076/091) — full MOD-02+MOD-03+MOD-04+
 * MOD-05+MOD-06+MOD-07+MOD-09+MOD-12 stack on a real Postgres. Every mutation dispatches through
 * the exact same domain use-case the online endpoint uses — zero duplicated business logic.
 */

function buildSyncTestAppModule() {
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
      InventoryModule,
      NotificationsModule,
      FeedModule,
      WaterModule,
      MortalityHealthModule,
      GrowthModule,
      TasksModule,
      SyncModule,
    ],
  })
  class SyncTestAppModule {}

  return SyncTestAppModule;
}

const OWNER_EMAIL = 'sync-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const WORKER_EMAIL = 'sync-worker@example.com';
const WORKER_PASSWORD = 'worker correct horse battery staple';
const PARTNER_EMAIL = 'sync-partner@example.com';
const PARTNER_PASSWORD = 'partner correct horse battery staple';
const OUTSIDER_EMAIL = 'sync-outsider@example.com';
const OUTSIDER_PASSWORD = 'outsider correct horse battery staple';

describe('Sync e2e (TASK-040, CON-040, AC-129/130/131/132/137/076/091)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let accessTokenFor: (email: string, password: string) => Promise<string>;
  let ownerToken: string;
  let workerToken: string;
  let partnerToken: string;
  let outsiderToken: string;
  let carpSpeciesId: string;
  let projectId: string;
  let pondId: string;
  let batchId: string;
  let inventoryItemId: string;

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
        InventoryItemPersistenceModel,
        InventoryTxnPersistenceModel,
        AlertPersistenceModel,
        DeliveryAttemptPersistenceModel,
        DeviceTokenPersistenceModel,
        FeedingLogPersistenceModel,
        WaterReadingPersistenceModel,
        WaterThresholdPersistenceModel,
        PondActionPersistenceModel,
        MortalityPersistenceModel,
        TreatmentPersistenceModel,
        SamplingPersistenceModel,
        TaskPersistenceModel,
        TaskLogPersistenceModel,
        SyncMutationPersistenceModel,
      ],
      migrations: [join(__dirname, '..', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const hasher = new Argon2PasswordHasher();
    const users = dataSource.getRepository(UserPersistenceModel);
    for (const [email, password, name] of [
      [OWNER_EMAIL, OWNER_PASSWORD, 'Sync Owner'],
      [WORKER_EMAIL, WORKER_PASSWORD, 'Sync Worker'],
      [PARTNER_EMAIL, PARTNER_PASSWORD, 'Sync Partner'],
      [OUTSIDER_EMAIL, OUTSIDER_PASSWORD, 'Sync Outsider'],
    ]) {
      await users.save({ email, name, passwordHash: await hasher.hash(password), status: 'ACTIVE' });
    }

    const carp = await dataSource.getRepository(SpeciesPersistenceModel).findOneByOrFail({ name: 'Carp' });
    carpSpeciesId = carp.id;

    const moduleRef = await Test.createTestingModule({
      imports: [buildSyncTestAppModule()],
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
    partnerToken = await accessTokenFor(PARTNER_EMAIL, PARTNER_PASSWORD);
    outsiderToken = await accessTokenFor(OUTSIDER_EMAIL, OUTSIDER_PASSWORD);

    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Sync Farm', siteLat: 23.7, siteLng: 90.3 })
      .expect(201);
    projectId = project.body.id;

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: WORKER_EMAIL, role: 'WORKER' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: PARTNER_EMAIL, role: 'PARTNER' })
      .expect(201);

    const pond = await request(app.getHttpServer())
      .post(`/projects/${projectId}/ponds`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'North Pond', area: 10 })
      .expect(201);
    pondId = pond.body.id;

    const stocking = await request(app.getHttpServer())
      .post(`/projects/${projectId}/ponds/${pondId}/stockings`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ speciesId: carpSpeciesId, count: 1000, stockedOn: '2026-01-01' })
      .expect(201);
    batchId = stocking.body.id;

    const item = await request(app.getHttpServer())
      .post(`/projects/${projectId}/inventory`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Floating pellets', feedType: 'FLOATING', unit: 'kg' })
      .expect(201);
    inventoryItemId = item.body.id;
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/inventory/${inventoryItemId}/transactions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ delta: 100, reason: 'Initial stock' })
      .expect(201);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  function syncOne(token: string, mutation: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ mutations: [mutation] });
  }

  describe('AC-129/AC-132/R6: feeding syncs through the same online use-case', () => {
    it('deducts inventory exactly like POST .../feedings would', async () => {
      const clientMutationId = randomUUID();
      const res = await syncOne(workerToken, {
        clientMutationId,
        entity: 'FEEDING_LOG',
        op: 'CREATE',
        payload: {
          projectId,
          batchId,
          inventoryItemId,
          qtyKg: 5,
          fedAt: new Date().toISOString(),
        },
      }).expect(200);

      expect(res.body.results).toEqual([
        { clientMutationId, status: 'SYNCED', serverId: expect.any(String) },
      ]);

      const items = await request(app.getHttpServer())
        .get(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(items.body.find((i: { id: string }) => i.id === inventoryItemId).quantity).toBe(95);
    });

    it('AC-130/R4: replaying the same clientMutationId is idempotent — no double deduction', async () => {
      const clientMutationId = randomUUID();
      const mutation = {
        clientMutationId,
        entity: 'FEEDING_LOG',
        op: 'CREATE',
        payload: { projectId, batchId, inventoryItemId, qtyKg: 3, fedAt: new Date().toISOString() },
      };

      const first = await syncOne(workerToken, mutation).expect(200);
      const second = await syncOne(workerToken, mutation).expect(200);
      expect(second.body.results[0].serverId).toBe(first.body.results[0].serverId);
      // AC-131: an append-only entity replay resolves SYNCED, never CONFLICT.
      expect(second.body.results[0].status).toBe('SYNCED');

      const items = await request(app.getHttpServer())
        .get(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(items.body.find((i: { id: string }) => i.id === inventoryItemId).quantity).toBe(92);
    });

    it('AC-137: a FAILED mutation is re-attempted (not returned stale) once the client resends a corrected payload', async () => {
      const clientMutationId = randomUUID();
      const badBatchId = randomUUID();

      const failed = await syncOne(workerToken, {
        clientMutationId,
        entity: 'FEEDING_LOG',
        op: 'CREATE',
        payload: { projectId, batchId: badBatchId, inventoryItemId, qtyKg: 1, fedAt: new Date().toISOString() },
      }).expect(200);
      expect(failed.body.results[0]).toEqual({
        clientMutationId,
        status: 'FAILED',
        serverId: null,
        error: { code: 'NOT_FOUND', message: 'Batch not found.' },
      });

      const retried = await syncOne(workerToken, {
        clientMutationId,
        entity: 'FEEDING_LOG',
        op: 'CREATE',
        payload: { projectId, batchId, inventoryItemId, qtyKg: 1, fedAt: new Date().toISOString() },
      }).expect(200);
      expect(retried.body.results[0].status).toBe('SYNCED');
      expect(retried.body.results[0].serverId).toEqual(expect.any(String));
    });

    it('AC-076: a synced feeding exceeding stock is still recorded, never blocked', async () => {
      const lowItem = await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Low stock pellets', feedType: 'FLOATING', unit: 'kg' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory/${lowItem.body.id}/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ delta: 2, reason: 'Initial stock' })
        .expect(201);

      const clientMutationId = randomUUID();
      const res = await syncOne(workerToken, {
        clientMutationId,
        entity: 'FEEDING_LOG',
        op: 'CREATE',
        payload: {
          projectId,
          batchId,
          inventoryItemId: lowItem.body.id,
          qtyKg: 5,
          fedAt: new Date().toISOString(),
        },
      }).expect(200);
      expect(res.body.results[0].status).toBe('SYNCED');

      const items = await request(app.getHttpServer())
        .get(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(items.body.find((i: { id: string }) => i.id === lowItem.body.id).quantity).toBe(-3);
    });
  });

  describe('AC-091: a late-synced critical water reading still raises a real breach', () => {
    it('evaluates the breach exactly like the online endpoint would', async () => {
      const clientMutationId = randomUUID();
      const res = await syncOne(workerToken, {
        clientMutationId,
        entity: 'WATER_READING',
        op: 'CREATE',
        payload: {
          projectId,
          pondId,
          parameter: 'DO',
          value: 2, // below the seeded critical threshold (3)
          readAt: new Date().toISOString(),
        },
      }).expect(200);
      expect(res.body.results[0].status).toBe('SYNCED');

      const alerts = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const breach = alerts.body.find(
        (a: { type: string; severity: string }) => a.type === 'WATER_THRESHOLD' && a.severity === 'CRITICAL',
      );
      expect(breach).toBeDefined();
    });
  });

  describe('other entities dispatch through the same online use-cases', () => {
    it('MORTALITY syncs and reduces survivalEstimate', async () => {
      const res = await syncOne(workerToken, {
        clientMutationId: randomUUID(),
        entity: 'MORTALITY',
        op: 'CREATE',
        payload: { projectId, batchId, count: 10, causeCategory: 'disease', occurredAt: new Date().toISOString() },
      }).expect(200);
      expect(res.body.results[0].status).toBe('SYNCED');

      const batch = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(batch.body.cumulativeMortality).toBeGreaterThanOrEqual(10);
    });

    it('SAMPLING syncs and updates latestAvgWeightG', async () => {
      const res = await syncOne(workerToken, {
        clientMutationId: randomUUID(),
        entity: 'SAMPLING',
        op: 'CREATE',
        payload: { projectId, batchId, sampleSize: 30, avgWeightG: 45, sampledOn: '2026-01-05' },
      }).expect(200);
      expect(res.body.results[0].status).toBe('SYNCED');

      const batch = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(batch.body.latestAvgWeightG).toBe(45);
    });

    it('WATER_EVENT syncs and raises a real CRITICAL emergency alert', async () => {
      const res = await syncOne(workerToken, {
        clientMutationId: randomUUID(),
        entity: 'WATER_EVENT',
        op: 'CREATE',
        payload: { projectId, pondId, note: 'Fish gasping at surface' },
      }).expect(200);
      expect(res.body.results[0].status).toBe('SYNCED');

      const alerts = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(alerts.body.some((a: { type: string }) => a.type === 'WATER_EMERGENCY')).toBe(true);
    });

    it('TASK_LOG syncs and completes the task', async () => {
      const task = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Lime the pond' })
        .expect(201);

      const res = await syncOne(workerToken, {
        clientMutationId: randomUUID(),
        entity: 'TASK_LOG',
        op: 'CREATE',
        payload: { projectId, taskId: task.body.id, completedAt: new Date().toISOString() },
      }).expect(200);
      expect(res.body.results[0].status).toBe('SYNCED');
    });

    it('AC-088: POND_ACTION syncs and records a real pond_action row (TASK-025)', async () => {
      const clientMutationId = randomUUID();
      const res = await syncOne(workerToken, {
        clientMutationId,
        entity: 'POND_ACTION',
        op: 'CREATE',
        payload: {
          projectId,
          pondId,
          actionType: 'CHAIN_DRAG',
          performedAt: new Date().toISOString(),
          notes: 'Routine chain drag',
        },
      }).expect(200);
      expect(res.body.results[0].status).toBe('SYNCED');

      const saved = await dataSource
        .getRepository(PondActionPersistenceModel)
        .findOneBy({ id: res.body.results[0].serverId });
      expect(saved).toMatchObject({
        projectId,
        pondId,
        actionType: 'CHAIN_DRAG',
        notes: 'Routine chain drag',
        clientMutationId,
      });
    });

    it('AC-130/R4: replaying the same POND_ACTION clientMutationId is idempotent — no duplicate row', async () => {
      const clientMutationId = randomUUID();
      const mutation = {
        clientMutationId,
        entity: 'POND_ACTION' as const,
        op: 'CREATE' as const,
        payload: { projectId, pondId, actionType: 'AERATION', performedAt: new Date().toISOString() },
      };
      const first = await syncOne(workerToken, mutation).expect(200);
      const second = await syncOne(workerToken, mutation).expect(200);
      expect(first.body.results[0].serverId).toBe(second.body.results[0].serverId);

      const rows = await dataSource.getRepository(PondActionPersistenceModel).findBy({ clientMutationId });
      expect(rows).toHaveLength(1);
    });

    it('an invalid actionType fails validation, never silently dropped', async () => {
      const res = await syncOne(workerToken, {
        clientMutationId: randomUUID(),
        entity: 'POND_ACTION',
        op: 'CREATE',
        payload: { projectId, pondId, actionType: 'LIMING', performedAt: new Date().toISOString() },
      }).expect(200);
      expect(res.body.results[0].status).toBe('FAILED');
      expect(res.body.results[0].error.code).toBe('VALIDATION');
    });
  });

  describe('AC-137: partial batch — one failure never aborts the others', () => {
    it('a batch with one bad mutation still syncs the good ones', async () => {
      const goodId = randomUUID();
      const badId = randomUUID();
      const res = await request(app.getHttpServer())
        .post('/sync')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          mutations: [
            {
              clientMutationId: goodId,
              entity: 'MORTALITY',
              op: 'CREATE',
              payload: { projectId, batchId, count: 1, causeCategory: 'other', occurredAt: new Date().toISOString() },
            },
            {
              clientMutationId: badId,
              entity: 'MORTALITY',
              op: 'CREATE',
              payload: { projectId, batchId: randomUUID(), count: 1, causeCategory: 'other', occurredAt: new Date().toISOString() },
            },
          ],
        })
        .expect(200);

      const good = res.body.results.find((r: { clientMutationId: string }) => r.clientMutationId === goodId);
      const bad = res.body.results.find((r: { clientMutationId: string }) => r.clientMutationId === badId);
      expect(good.status).toBe('SYNCED');
      expect(bad.status).toBe('FAILED');
      expect(bad.error.code).toBe('NOT_FOUND');
    });
  });

  describe('authorization', () => {
    it('a non-member project in the payload fails FORBIDDEN, not a 500', async () => {
      const res = await syncOne(outsiderToken, {
        clientMutationId: randomUUID(),
        entity: 'MORTALITY',
        op: 'CREATE',
        payload: { projectId, batchId, count: 1, causeCategory: 'other', occurredAt: new Date().toISOString() },
      }).expect(200);
      expect(res.body.results[0].status).toBe('FAILED');
      expect(res.body.results[0].error.code).toBe('FORBIDDEN');
    });

    it('a PARTNER (read-only, no canWrite) mutation fails FORBIDDEN', async () => {
      const res = await syncOne(partnerToken, {
        clientMutationId: randomUUID(),
        entity: 'MORTALITY',
        op: 'CREATE',
        payload: { projectId, batchId, count: 1, causeCategory: 'other', occurredAt: new Date().toISOString() },
      }).expect(200);
      expect(res.body.results[0].status).toBe('FAILED');
      expect(res.body.results[0].error.code).toBe('FORBIDDEN');
    });

    it('an unauthenticated request is rejected with 401', async () => {
      await request(app.getHttpServer())
        .post('/sync')
        .send({
          mutations: [
            {
              clientMutationId: randomUUID(),
              entity: 'MORTALITY',
              op: 'CREATE',
              payload: { projectId, batchId, count: 1, causeCategory: 'other', occurredAt: new Date().toISOString() },
            },
          ],
        })
        .expect(401);
    });
  });
});
