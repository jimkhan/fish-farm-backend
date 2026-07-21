import { randomUUID } from 'node:crypto';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { join } from 'path';
import type { StockingRecorded } from '@fish-farm/shared';
import { validateEnv } from '../src/platform/config/env.validation';
import { buildDataSourceOptions } from '../src/platform/persistence/data-source.options';
import { PersistenceModule } from '../src/platform/persistence/persistence.module';
import { AuditEntryPersistenceModel } from '../src/shared-kernel/audit/audit-entry.persistence-model';
import { AuditModule } from '../src/shared-kernel/audit/audit.module';
import { ErrorsModule } from '../src/shared-kernel/errors/errors.module';
import { TenantModule } from '../src/shared-kernel/tenant/tenant.module';
import { EventsModule } from '../src/platform/events/events.module';
import { DomainEventBus } from '../src/platform/events/domain-event-bus';
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
import { HarvestPersistenceModel } from '../src/modules/harvest/infrastructure/persistence/harvest.persistence-model';
import { HarvestModule } from '../src/modules/harvest/harvest.module';
import { FinancialTxnPersistenceModel } from '../src/modules/finance/infrastructure/persistence/financial-txn.persistence-model';
import { FinanceModule } from '../src/modules/finance/finance.module';
import { startTestPostgres } from './support/postgres-test-container';

/**
 * Finance e2e (TASK-032, CON-032/033, F1/F4, AC-107/108/109/113/114/115/116/117) — full MOD-02+
 * MOD-03+MOD-04+MOD-05+MOD-07+MOD-08 stack on a real Postgres. Cost/revenue ingestion is proven
 * through the real online endpoints that publish `StockingRecorded`/`FeedCostIncurred`/
 * `HarvestRevenueEarned` — zero synthetic `bus.publish()` except the one deliberate AC-117 replay.
 */

function buildFinanceTestAppModule() {
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
      HarvestModule,
      FinanceModule,
    ],
  })
  class FinanceTestAppModule {}

  return FinanceTestAppModule;
}

const OWNER_EMAIL = 'finance-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const WORKER_EMAIL = 'finance-worker@example.com';
const WORKER_PASSWORD = 'worker correct horse battery staple';
const PARTNER_EMAIL = 'finance-partner@example.com';
const PARTNER_PASSWORD = 'partner correct horse battery staple';
const OUTSIDER_EMAIL = 'finance-outsider@example.com';
const OUTSIDER_PASSWORD = 'outsider correct horse battery staple';

describe('Finance e2e (TASK-032, CON-032/033, AC-107/108/109/113/114/115/116/117)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let events: DomainEventBus;
  let accessTokenFor: (email: string, password: string) => Promise<string>;
  let ownerToken: string;
  let workerToken: string;
  let partnerToken: string;
  let outsiderToken: string;
  let carpSpeciesId: string;
  let projectId: string;
  let projectBId: string;
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
        InventoryItemPersistenceModel,
        InventoryTxnPersistenceModel,
        HarvestPersistenceModel,
        FinancialTxnPersistenceModel,
      ],
      migrations: [join(__dirname, '..', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const hasher = new Argon2PasswordHasher();
    const users = dataSource.getRepository(UserPersistenceModel);
    for (const [email, password, name] of [
      [OWNER_EMAIL, OWNER_PASSWORD, 'Finance Owner'],
      [WORKER_EMAIL, WORKER_PASSWORD, 'Finance Worker'],
      [PARTNER_EMAIL, PARTNER_PASSWORD, 'Finance Partner'],
      [OUTSIDER_EMAIL, OUTSIDER_PASSWORD, 'Finance Outsider'],
    ]) {
      await users.save({ email, name, passwordHash: await hasher.hash(password), status: 'ACTIVE' });
    }

    const carp = await dataSource.getRepository(SpeciesPersistenceModel).findOneByOrFail({ name: 'Carp' });
    carpSpeciesId = carp.id;

    const moduleRef = await Test.createTestingModule({
      imports: [buildFinanceTestAppModule()],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    events = moduleRef.get(DomainEventBus);

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
      .send({ name: 'Finance Farm', siteLat: 23.7, siteLng: 90.3 })
      .expect(201);
    projectId = project.body.id;

    const projectB = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Finance Farm B', siteLat: 23.7, siteLng: 90.3 })
      .expect(201);
    projectBId = projectB.body.id;

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
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  describe('AC-107/116: Owner records a manual cost', () => {
    it('stores it as integer minor units in BDT', async () => {
      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/finance/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          kind: 'COST',
          category: 'SALARY',
          amount: { amountMinor: 1_000_00 },
          occurredOn: '2026-02-01',
          note: 'Monthly wage',
        })
        .expect(201);
      expect(res.body.amount).toEqual({ amountMinor: 100000, currency: 'BDT' });
      expect(res.body.category).toBe('SALARY');
    });

    it('R2: rejects a mismatched kind/category', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/finance/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ kind: 'COST', category: 'HARVEST', amount: { amountMinor: 1000 }, occurredOn: '2026-02-01' })
        .expect(400);
    });
  });

  describe('AC-109: StockingRecorded and FeedCostIncurred auto-ingest', () => {
    it('a stocking with a cost auto-records a STOCKING cost transaction', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${pondId}/stockings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ speciesId: carpSpeciesId, count: 1000, stockedOn: '2026-01-01', stockingCost: { amountMinor: 300000 } })
        .expect(201);

      const txns = await request(app.getHttpServer())
        .get(`/projects/${projectId}/finance/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      // The stocking endpoint returns the Batch (a different id from the Stocking that is
      // actually the ingestion's `sourceRef`) — match on category + the distinctive amount instead.
      const stockingTxn = txns.body.find(
        (t: { category: string; amount: { amountMinor: number } }) =>
          t.category === 'STOCKING' && t.amount.amountMinor === 300000,
      );
      expect(stockingTxn).toBeDefined();
      expect(stockingTxn.kind).toBe('COST');
      expect(stockingTxn.amount.amountMinor).toBe(300000);
    });

    it('an inventory receipt with a cost auto-records a FEED cost transaction', async () => {
      const item = await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Floating pellets', feedType: 'FLOATING', unit: 'kg' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory/${item.body.id}/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ delta: 100, reason: 'Initial stock', cost: { amountMinor: 45000 } })
        .expect(201);

      const txns = await request(app.getHttpServer())
        .get(`/projects/${projectId}/finance/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const feedTxn = txns.body.find((t: { category: string; amount: { amountMinor: number } }) =>
        t.category === 'FEED' && t.amount.amountMinor === 45000,
      );
      expect(feedTxn).toBeDefined();
    });
  });

  describe('AC-108: HarvestRevenueEarned auto-ingests', () => {
    it('a harvest with revenue auto-records a HARVEST revenue transaction', async () => {
      const stocking = await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${pondId}/stockings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ speciesId: carpSpeciesId, count: 500, stockedOn: '2026-01-01' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${stocking.body.id}/harvests`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          quantity: 100,
          totalWeightKg: 150,
          grade: 'LOCAL',
          harvestedOn: '2026-02-10',
          revenue: { amountMinor: 750000 },
          clientMutationId: randomUUID(),
        })
        .expect(201);

      const txns = await request(app.getHttpServer())
        .get(`/projects/${projectId}/finance/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const revenueTxn = txns.body.find(
        (t: { category: string; amount: { amountMinor: number } }) =>
          t.category === 'HARVEST' && t.amount.amountMinor === 750000,
      );
      expect(revenueTxn).toBeDefined();
      expect(revenueTxn.kind).toBe('REVENUE');
    });
  });

  describe('AC-117: duplicate event redelivery is idempotent', () => {
    it('replaying the same StockingRecorded event never double-counts', async () => {
      const stocking = await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${pondId}/stockings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ speciesId: carpSpeciesId, count: 10, stockedOn: '2026-01-01', stockingCost: { amountMinor: 9999 } })
        .expect(201);

      const before = await request(app.getHttpServer())
        .get(`/projects/${projectId}/finance/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      // The stocking endpoint returns the Batch (a different id from the Stocking) — recover the
      // real stockingId (the ingestion's `sourceRef`) from the transaction it just created.
      const ingested = before.body.find(
        (t: { category: string; amount: { amountMinor: number } }) =>
          t.category === 'STOCKING' && t.amount.amountMinor === 9999,
      );
      expect(ingested).toBeDefined();
      const realStockingId: string = ingested.sourceRef;

      const replay: StockingRecorded = {
        name: 'StockingRecorded',
        eventId: randomUUID(),
        occurredAt: new Date(),
        projectId,
        stockingId: realStockingId,
        batchId: stocking.body.id,
        pondId,
        speciesId: carpSpeciesId,
        stockingCostMinor: 9999,
      };
      await events.publish(replay);

      const after = await request(app.getHttpServer())
        .get(`/projects/${projectId}/finance/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const countAfter = after.body.filter((t: { sourceRef: string }) => t.sourceRef === realStockingId).length;
      expect(countAfter).toBe(1);
    });
  });

  describe('AC-113/114/115: role gating and cross-project isolation (guardrail)', () => {
    it('AC-113: a Worker requesting finance is denied — finance is hidden', async () => {
      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/finance/transactions`)
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(403);
      expect(res.body.message).toBe('Finance is not available for your role.');
    });

    it('AC-114: a Partner reads successfully but cannot write', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/finance/transactions`)
        .set('Authorization', `Bearer ${partnerToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/finance/transactions`)
        .set('Authorization', `Bearer ${partnerToken}`)
        .send({ kind: 'COST', category: 'MISC', amount: { amountMinor: 1000 }, occurredOn: '2026-02-01' })
        .expect(403);
      expect(res.body.message).toBe('Partners have read-only access.');
    });

    it('AC-115: a Partner of project A cannot see project B finances (no disclosure)', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectBId}/finance/transactions`)
        .set('Authorization', `Bearer ${partnerToken}`)
        .expect(403);
    });

    it('a non-member is denied entirely', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/finance/transactions`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(403);
    });
  });

  describe('R9: closed-project write-guard', () => {
    it('returns PROJECT_CLOSED/409', async () => {
      const closedProject = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Soon Closed Finance Farm', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/projects/${closedProject.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'CLOSED' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/projects/${closedProject.body.id}/finance/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ kind: 'COST', category: 'MISC', amount: { amountMinor: 1000 }, occurredOn: '2026-02-01' })
        .expect(409);
      expect(res.body.code).toBe('PROJECT_CLOSED');
    });
  });
});
