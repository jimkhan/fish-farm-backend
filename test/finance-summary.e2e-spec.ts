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
import { BatchPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/batch.persistence-model';
import { PondPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/pond.persistence-model';
import { SpeciesPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/species.persistence-model';
import { StockingPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/stocking.persistence-model';
import { PondsModule } from '../src/modules/ponds/ponds.module';
import { ProjectPersistenceModel } from '../src/modules/projects/infrastructure/persistence/project.persistence-model';
import { ProjectsModule } from '../src/modules/projects/projects.module';
import { PortfolioModule } from '../src/modules/projects/portfolio.module';
import { InventoryItemPersistenceModel } from '../src/modules/inventory/infrastructure/persistence/inventory-item.persistence-model';
import { InventoryTxnPersistenceModel } from '../src/modules/inventory/infrastructure/persistence/inventory-txn.persistence-model';
import { InventoryModule } from '../src/modules/inventory/inventory.module';
import { HarvestPersistenceModel } from '../src/modules/harvest/infrastructure/persistence/harvest.persistence-model';
import { HarvestModule } from '../src/modules/harvest/harvest.module';
import { SamplingPersistenceModel } from '../src/modules/growth/infrastructure/persistence/sampling.persistence-model';
import { GrowthModule } from '../src/modules/growth/growth.module';
import { AlertPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/alert.persistence-model';
import { DeliveryAttemptPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/delivery-attempt.persistence-model';
import { DeviceTokenPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/device-token.persistence-model';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';
import { FinancialTxnPersistenceModel } from '../src/modules/finance/infrastructure/persistence/financial-txn.persistence-model';
import { FinanceModule } from '../src/modules/finance/finance.module';
import { startTestPostgres, type DisposablePostgres } from './support/postgres-test-container';

/**
 * Finance summary / portfolio ROI e2e (TASK-033, CON-034, F2/F3, AC-110/111/112) — full MOD-02+
 * MOD-03+MOD-04+MOD-05+MOD-07+MOD-08 stack on a real Postgres.
 */

function buildFinanceSummaryTestAppModule() {
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
      PortfolioModule,
      PondsModule,
      InventoryModule,
      HarvestModule,
      GrowthModule,
      NotificationsModule,
      FinanceModule,
    ],
  })
  class FinanceSummaryTestAppModule {}

  return FinanceSummaryTestAppModule;
}

const OWNER_EMAIL = 'roi-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const WORKER_EMAIL = 'roi-worker@example.com';
const WORKER_PASSWORD = 'worker correct horse battery staple';
const PARTNER_EMAIL = 'roi-partner@example.com';
const PARTNER_PASSWORD = 'partner correct horse battery staple';

describe('Finance summary / portfolio ROI e2e (TASK-033, CON-034, AC-110/111/112)', () => {
  let container: DisposablePostgres;
  let dataSource: DataSource;
  let app: INestApplication;
  let accessTokenFor: (email: string, password: string) => Promise<string>;
  let ownerToken: string;
  let workerToken: string;
  let partnerToken: string;
  let carpSpeciesId: string;
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
        InventoryItemPersistenceModel,
        InventoryTxnPersistenceModel,
        HarvestPersistenceModel,
        SamplingPersistenceModel,
        AlertPersistenceModel,
        DeliveryAttemptPersistenceModel,
        DeviceTokenPersistenceModel,
        FinancialTxnPersistenceModel,
      ],
      migrations: [join(__dirname, '..', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const hasher = new Argon2PasswordHasher();
    const users = dataSource.getRepository(UserPersistenceModel);
    for (const [email, password, name] of [
      [OWNER_EMAIL, OWNER_PASSWORD, 'ROI Owner'],
      [WORKER_EMAIL, WORKER_PASSWORD, 'ROI Worker'],
      [PARTNER_EMAIL, PARTNER_PASSWORD, 'ROI Partner'],
    ]) {
      await users.save({ email, name, passwordHash: await hasher.hash(password), status: 'ACTIVE' });
    }

    const species = dataSource.getRepository(SpeciesPersistenceModel);
    carpSpeciesId = (await species.findOneByOrFail({ name: 'Carp' })).id;
    goldaSpeciesId = (await species.findOneByOrFail({ name: 'SPF Golda' })).id;

    const moduleRef = await Test.createTestingModule({
      imports: [buildFinanceSummaryTestAppModule()],
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

    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'ROI Farm', siteLat: 23.7, siteLng: 90.3 })
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
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  describe('AC-110/111: finance summary computes net profit, ROI, and remaining harvest value', () => {
    it('reflects real recorded costs/revenue and real remaining biomass', async () => {
      // Stock 1000 Carp (FISH → LOCAL rate) with a sampling so biomass is known.
      const stocking = await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${pondId}/stockings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ speciesId: carpSpeciesId, count: 1000, stockedOn: '2026-01-01' })
        .expect(201);
      const batchId = stocking.body.id;

      // Harvest 200 of them → reduces remaining survival to 800, records revenue.
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/harvests`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          quantity: 200,
          totalWeightKg: 20,
          grade: 'LOCAL',
          harvestedOn: '2026-02-01',
          revenue: { amountMinor: 1_000_000 },
          clientMutationId: randomUUID(),
        })
        .expect(201);

      // A manual cost.
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/finance/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ kind: 'COST', category: 'SALARY', amount: { amountMinor: 400_000 }, occurredOn: '2026-02-01' })
        .expect(201);

      const summary = await request(app.getHttpServer())
        .get(`/projects/${projectId}/finance/summary`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(summary.body.totalRevenue.amountMinor).toBe(1_000_000);
      expect(summary.body.totalCost.amountMinor).toBe(400_000);
      expect(summary.body.netProfit.amountMinor).toBe(600_000);
      // No sampling was ever recorded → latestAvgWeightG stays null → remaining biomass is 0.
      expect(summary.body.remainingHarvestValue.amountMinor).toBe(0);
      // projectedRoiPct = (600,000 + 0) / 400,000 × 100 = 150
      expect(summary.body.projectedRoiPct).toBeCloseTo(150);
    });

    it('a PRAWN batch with known biomass values remaining stock at the EXPORT rate', async () => {
      const stocking = await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${pondId}/stockings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ speciesId: goldaSpeciesId, count: 500, stockedOn: '2026-01-01' })
        .expect(201);
      const batchId = stocking.body.id;

      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/samplings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sampleSize: 30, avgWeightG: 40, sampledOn: '2026-01-15', clientMutationId: randomUUID() })
        .expect(201);

      const summary = await request(app.getHttpServer())
        .get(`/projects/${projectId}/finance/summary`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      // This batch alone: 500 × 40g = 20,000g = 20kg × 80,000 minor/kg = 1,600,000 (plus the
      // Carp batch from the prior test, which stays 0 — no sampling was ever recorded for it).
      expect(summary.body.remainingHarvestValue.amountMinor).toBeGreaterThanOrEqual(1_600_000);
    });
  });

  describe('finance summary role gate (same capability as the transaction list)', () => {
    it('a Worker is denied — finance is hidden', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/finance/summary`)
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(403);
    });

    it('a Partner reads successfully', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/finance/summary`)
        .set('Authorization', `Bearer ${partnerToken}`)
        .expect(200);
    });
  });

  describe('AC-112: portfolio roll-up sums real net profit across owned projects', () => {
    it('reflects the same net profit computed for the single project', async () => {
      const portfolio = await request(app.getHttpServer())
        .get('/portfolio/summary')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const summary = await request(app.getHttpServer())
        .get(`/projects/${projectId}/finance/summary`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(portfolio.body.netProfit.amountMinor).toBe(summary.body.netProfit.amountMinor);
      expect(portfolio.body.netProfit.currency).toBe('BDT');
    });

    it('a second owned project with its own costs adds to the portfolio total, not the first project\'s summary', async () => {
      const projectB = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'ROI Farm B', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/projects/${projectB.body.id}/finance/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ kind: 'REVENUE', category: 'HARVEST', amount: { amountMinor: 250_000 }, occurredOn: '2026-02-01' })
        .expect(201);

      const before = await request(app.getHttpServer())
        .get(`/projects/${projectId}/finance/summary`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const portfolio = await request(app.getHttpServer())
        .get('/portfolio/summary')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(portfolio.body.netProfit.amountMinor).toBe(before.body.netProfit.amountMinor + 250_000);
    });
  });
});
