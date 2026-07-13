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
import { startTestPostgres } from './support/postgres-test-container';

/**
 * Feeding log e2e (TASK-022, CON-018, F5/F6, AC-074/075/077) — full MOD-02+MOD-03+MOD-04+MOD-05+
 * MOD-09 stack on a real Postgres. A real low-stock crossing dispatches through MOD-09's
 * already-built `OnLowStockHandler` into a real, queryable alert — zero synthetic `bus.publish()`.
 */

function buildFeedingLogTestAppModule() {
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
    ],
  })
  class FeedingLogTestAppModule {}

  return FeedingLogTestAppModule;
}

const OWNER_EMAIL = 'feeding-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const WORKER_EMAIL = 'feeding-worker@example.com';
const WORKER_PASSWORD = 'worker correct horse battery staple';
const OUTSIDER_EMAIL = 'feeding-outsider@example.com';
const OUTSIDER_PASSWORD = 'outsider correct horse battery staple';

describe('Feeding log e2e (TASK-022, CON-018, AC-074/075/077)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let accessTokenFor: (email: string, password: string) => Promise<string>;
  let ownerToken: string;
  let workerToken: string;
  let outsiderToken: string;
  let carpSpeciesId: string;
  let projectId: string;
  let pondId: string;
  let batchId: string;

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
      ],
      migrations: [join(__dirname, '..', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const hasher = new Argon2PasswordHasher();
    const users = dataSource.getRepository(UserPersistenceModel);
    for (const [email, password, name] of [
      [OWNER_EMAIL, OWNER_PASSWORD, 'Feeding Owner'],
      [WORKER_EMAIL, WORKER_PASSWORD, 'Feeding Worker'],
      [OUTSIDER_EMAIL, OUTSIDER_PASSWORD, 'Feeding Outsider'],
    ]) {
      await users.save({ email, name, passwordHash: await hasher.hash(password), status: 'ACTIVE' });
    }

    const carp = await dataSource.getRepository(SpeciesPersistenceModel).findOneByOrFail({ name: 'Carp' });
    carpSpeciesId = carp.id;

    const moduleRef = await Test.createTestingModule({
      imports: [buildFeedingLogTestAppModule()],
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
      .send({ name: 'Feeding Farm', siteLat: 23.7, siteLng: 90.3 })
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

    const stocking = await request(app.getHttpServer())
      .post(`/projects/${projectId}/ponds/${pondId}/stockings`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ speciesId: carpSpeciesId, count: 1000, stockedOn: '2026-01-01' })
      .expect(201);
    batchId = stocking.body.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  async function createItem(feedType: 'FLOATING' | 'SINKING', lowStockThreshold?: number): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/projects/${projectId}/inventory`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `${feedType} pellets ${randomUUID()}`, feedType, unit: 'kg', lowStockThreshold })
      .expect(201);
    return res.body.id;
  }

  async function receive(itemId: string, delta: number): Promise<void> {
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/inventory/${itemId}/transactions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ delta, reason: 'Initial stock' })
      .expect(201);
  }

  describe('AC-074: atomic feeding-insert + inventory-decrement', () => {
    it('a Worker logs a feeding and the matching item is atomically decremented', async () => {
      const itemId = await createItem('FLOATING');
      await receive(itemId, 100);

      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/feedings`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ inventoryItemId: itemId, qtyKg: 5, fedAt: new Date().toISOString(), clientMutationId: randomUUID() })
        .expect(201);
      expect(res.body.qtyKg).toBe(5);
      expect(res.body.batchId).toBe(batchId);

      const item = await request(app.getHttpServer())
        .get(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(item.body.find((i: { id: string }) => i.id === itemId).quantity).toBe(95);
    });

    it('ADR-010: a replayed clientMutationId returns the same log without double-deducting', async () => {
      const itemId = await createItem('FLOATING');
      await receive(itemId, 100);
      const clientMutationId = randomUUID();
      const body = { inventoryItemId: itemId, qtyKg: 5, fedAt: new Date().toISOString(), clientMutationId };

      const first = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/feedings`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send(body)
        .expect(201);
      const second = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/feedings`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send(body)
        .expect(201);
      expect(second.body.id).toBe(first.body.id);

      const item = await request(app.getHttpServer())
        .get(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(item.body.find((i: { id: string }) => i.id === itemId).quantity).toBe(95);
    });
  });

  describe('AC-075/R4: feed-type mismatch', () => {
    it('rejects a feeding logged against a mismatched feed-type item', async () => {
      const sinkingItemId = await createItem('SINKING');
      await receive(sinkingItemId, 100);

      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/feedings`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ inventoryItemId: sinkingItemId, qtyKg: 5, fedAt: new Date().toISOString(), clientMutationId: randomUUID() })
        .expect(400);
      expect(res.body.code).toBe('FEED_TYPE_MISMATCH');
    });
  });

  describe('AC-077/F6: check-tray observation', () => {
    it('stores the observation alongside the feeding', async () => {
      const itemId = await createItem('FLOATING');
      await receive(itemId, 100);

      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/feedings`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          inventoryItemId: itemId,
          qtyKg: 5,
          fedAt: new Date().toISOString(),
          observation: 'LEFTOVER',
          clientMutationId: randomUUID(),
        })
        .expect(201);
      expect(res.body.observation).toBe('LEFTOVER');
    });
  });

  describe('R5/edge case 6: over-deduction is recorded, never blocked', () => {
    it('a feeding exceeding stock is still recorded, driving quantity negative', async () => {
      const itemId = await createItem('FLOATING');
      await receive(itemId, 3);

      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/feedings`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ inventoryItemId: itemId, qtyKg: 5, fedAt: new Date().toISOString(), clientMutationId: randomUUID() })
        .expect(201);

      const item = await request(app.getHttpServer())
        .get(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(item.body.find((i: { id: string }) => i.id === itemId).quantity).toBe(-2);
    });
  });

  describe('R6: low-stock crossing', () => {
    it('a deduction crossing the threshold raises a real, queryable LOW_STOCK alert', async () => {
      const itemName = `FLOATING pellets ${randomUUID()}`;
      const created = await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: itemName, feedType: 'FLOATING', unit: 'kg', lowStockThreshold: 10 })
        .expect(201);
      const itemId = created.body.id;
      await receive(itemId, 12);

      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/feedings`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ inventoryItemId: itemId, qtyKg: 5, fedAt: new Date().toISOString(), clientMutationId: randomUUID() })
        .expect(201);

      const item = await request(app.getHttpServer())
        .get(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(item.body.find((i: { id: string }) => i.id === itemId).quantity).toBe(7);

      const alerts = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const lowStockAlert = alerts.body.find(
        (a: { type: string; message: string }) => a.type === 'LOW_STOCK' && a.message.includes(itemName),
      );
      expect(lowStockAlert).toBeDefined();
    });
  });

  describe('tenant isolation and closed-project guard', () => {
    it('denies a non-member with no data disclosure', async () => {
      const itemId = await createItem('FLOATING');
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/feedings`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ inventoryItemId: itemId, qtyKg: 5, fedAt: new Date().toISOString(), clientMutationId: randomUUID() })
        .expect(403);
    });

    it('a batch from another project 404s', async () => {
      const itemId = await createItem('FLOATING');
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${randomUUID()}/feedings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ inventoryItemId: itemId, qtyKg: 5, fedAt: new Date().toISOString(), clientMutationId: randomUUID() })
        .expect(404);
    });

    it('R9: logging a feeding on a CLOSED project returns PROJECT_CLOSED/409', async () => {
      const closedProject = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Soon Closed Feeding Farm', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);
      const closedPond = await request(app.getHttpServer())
        .post(`/projects/${closedProject.body.id}/ponds`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'A Pond', area: 5 })
        .expect(201);
      const closedStocking = await request(app.getHttpServer())
        .post(`/projects/${closedProject.body.id}/ponds/${closedPond.body.id}/stockings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ speciesId: carpSpeciesId, count: 100, stockedOn: '2026-01-01' })
        .expect(201);
      const closedItem = await request(app.getHttpServer())
        .post(`/projects/${closedProject.body.id}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Pellets', feedType: 'FLOATING', unit: 'kg' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/projects/${closedProject.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'CLOSED' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/projects/${closedProject.body.id}/batches/${closedStocking.body.id}/feedings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          inventoryItemId: closedItem.body.id,
          qtyKg: 5,
          fedAt: new Date().toISOString(),
          clientMutationId: randomUUID(),
        })
        .expect(409);
      expect(res.body.code).toBe('PROJECT_CLOSED');
    });
  });
});
