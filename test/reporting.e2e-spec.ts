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
import { TaskPersistenceModel } from '../src/modules/tasks/infrastructure/persistence/task.persistence-model';
import { TaskLogPersistenceModel } from '../src/modules/tasks/infrastructure/persistence/task-log.persistence-model';
import { TasksModule } from '../src/modules/tasks/tasks.module';
import { FinanceModule } from '../src/modules/finance/finance.module';
import { ReportingModule } from '../src/modules/reporting/reporting.module';
import { startTestPostgres, type DisposablePostgres } from './support/postgres-test-container';

/**
 * Daily summary e2e (TASK-037, CON-042, F3/R5, AC-122/124/125) — full MOD-02+MOD-03+MOD-04+
 * MOD-05+MOD-06+MOD-07+MOD-12 stack on a real Postgres. Composes real feed/mortality/water/task
 * data through the exact same repository ports the online CRUD endpoints already use — zero
 * synthetic seeding of read-model rows.
 */

function buildReportingTestAppModule() {
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
      TasksModule,
      // TASK-038: the report-export use-case reads finance's summary + txn repo (both now exported
      // from the @Global FinanceModule). Growth/Harvest arrive transitively via ReportingModule.
      FinanceModule,
      ReportingModule,
    ],
  })
  class ReportingTestAppModule {}

  return ReportingTestAppModule;
}

const OWNER_EMAIL = 'reporting-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const WORKER_EMAIL = 'reporting-worker@example.com';
const WORKER_PASSWORD = 'worker correct horse battery staple';
const PARTNER_EMAIL = 'reporting-partner@example.com';
const PARTNER_PASSWORD = 'partner correct horse battery staple';
const OUTSIDER_EMAIL = 'reporting-outsider@example.com';
const OUTSIDER_PASSWORD = 'outsider correct horse battery staple';

describe('Daily summary e2e (TASK-037, CON-042, AC-122/124/125)', () => {
  let container: DisposablePostgres;
  let dataSource: DataSource;
  let app: INestApplication;
  let accessTokenFor: (email: string, password: string) => Promise<string>;
  let ownerToken: string;
  let workerToken: string;
  let partnerToken: string;
  let outsiderToken: string;
  let goldaSpeciesId: string;
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
        WaterReadingPersistenceModel,
        WaterThresholdPersistenceModel,
        PondActionPersistenceModel,
        MortalityPersistenceModel,
        TreatmentPersistenceModel,
        TaskPersistenceModel,
        TaskLogPersistenceModel,
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
      [PARTNER_EMAIL, PARTNER_PASSWORD],
      [OUTSIDER_EMAIL, OUTSIDER_PASSWORD],
    ]) {
      await users.save({ email, name: email, passwordHash: await hasher.hash(password), status: 'ACTIVE' });
    }

    const golda = await dataSource
      .getRepository(SpeciesPersistenceModel)
      .findOneByOrFail({ name: 'SPF Golda' });
    goldaSpeciesId = golda.id;

    const moduleRef = await Test.createTestingModule({
      imports: [buildReportingTestAppModule()],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    accessTokenFor = async (email, password) => {
      const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
      return res.body.accessToken;
    };
    ownerToken = await accessTokenFor(OWNER_EMAIL, OWNER_PASSWORD);
    workerToken = await accessTokenFor(WORKER_EMAIL, WORKER_PASSWORD);
    partnerToken = await accessTokenFor(PARTNER_EMAIL, PARTNER_PASSWORD);
    outsiderToken = await accessTokenFor(OUTSIDER_EMAIL, OUTSIDER_PASSWORD);

    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Reporting Farm', siteLat: 23.7, siteLng: 90.3 })
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
      .send({ name: 'Reporting Pond', area: 10 })
      .expect(201);
    pondId = pond.body.id;

    const stocking = await request(app.getHttpServer())
      .post(`/projects/${projectId}/ponds/${pondId}/stockings`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ speciesId: goldaSpeciesId, count: 1000, stockedOn: '2026-01-01' })
      .expect(201);
    batchId = stocking.body.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  it('AC-125: a fresh date with zero activity returns zeros/OK, not an error', async () => {
    const res = await request(app.getHttpServer())
      .get(`/projects/${projectId}/reports/daily-summary?date=2026-03-01`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body).toEqual({
      date: '2026-03-01',
      feedUsedKg: 0,
      mortalities: 0,
      waterStatus: 'OK',
      tasksDone: 0,
      tasksMissed: 0,
    });
  });

  it('AC-122: composes real feed/mortality/water data recorded that same date', async () => {
    const item = await request(app.getHttpServer())
      .post(`/projects/${projectId}/inventory`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Sinking pellets', feedType: 'SINKING', unit: 'kg' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/inventory/${item.body.id}/transactions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ delta: 100, reason: 'Initial stock' })
      .expect(201);

    const date = '2026-04-10';
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/batches/${batchId}/feedings`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ inventoryItemId: item.body.id, qtyKg: 12, fedAt: `${date}T08:00:00.000Z`, clientMutationId: 'rpt-feed-1' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/batches/${batchId}/mortalities`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ count: 4, causeCategory: 'DISEASE', occurredAt: `${date}T09:00:00.000Z`, clientMutationId: 'rpt-mort-1' })
      .expect(201);

    // DO below the seeded default min=4, above critical=3 → WARNING
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/ponds/${pondId}/water-readings`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ parameter: 'DO', value: 3.5, readAt: `${date}T10:00:00.000Z`, clientMutationId: 'rpt-water-1' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/projects/${projectId}/reports/daily-summary?date=${date}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body).toEqual({
      date,
      feedUsedKg: 12,
      mortalities: 4,
      waterStatus: 'WARNING',
      tasksDone: 0,
      tasksMissed: 0,
    });
  });

  it('reports are readable by Owner and Partner, denied for Worker', async () => {
    await request(app.getHttpServer())
      .get(`/projects/${projectId}/reports/daily-summary?date=2026-03-01`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/projects/${projectId}/reports/daily-summary?date=2026-03-01`)
      .set('Authorization', `Bearer ${workerToken}`)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('AC-124: a non-member is denied with no data disclosure', async () => {
    await request(app.getHttpServer())
      .get(`/projects/${projectId}/reports/daily-summary?date=2026-03-01`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });

  it('omitting the date query param defaults to today (a real, non-crashing response)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/projects/${projectId}/reports/daily-summary`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(typeof res.body.date).toBe('string');
    expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  describe('CON-046: report exports (TASK-038, AC-123/126)', () => {
    // Seed one harvest + one manual finance cost so the harvest/financial exports have content.
    beforeAll(async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/harvests`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          quantity: 400,
          totalWeightKg: 100,
          grade: 'EXPORT',
          harvestedOn: '2026-06-20',
          revenue: { amountMinor: 800000 },
          clientMutationId: 'rpt-export-harvest-1',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/projects/${projectId}/finance/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ kind: 'COST', category: 'FEED', amount: { amountMinor: 250000 }, occurredOn: '2026-05-02', note: 'Pellets, 50kg' })
        .expect(201);
    });

    it('AC-126: growth export is CSV for any member, with dual-rendered dates', async () => {
      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/reports/export`)
        .query({ kind: 'growth' })
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(200);
      expect(res.headers['content-disposition']).toContain('growth-report-');
      const body = res.text ?? res.body.toString();
      expect(body).toContain('Batch ID,Species ID,Stocked On');
      expect(body).toContain(batchId);
      // dual date column is quoted because the Bangla part contains a comma
      expect(body).toMatch(/"2026-01-01 \(.+\)"/);
    });

    it('harvest export is available to any member and contains the seeded harvest', async () => {
      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/reports/export`)
        .query({ kind: 'harvest' })
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(200);
      const body = res.text ?? res.body.toString();
      expect(body).toContain('Harvest ID,Batch ID,Harvested On');
      expect(body).toContain('EXPORT');
    });

    it('AC-123: financial export — Worker 403, Partner + Owner allowed', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/reports/export`)
        .query({ kind: 'financial' })
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/projects/${projectId}/reports/export`)
        .query({ kind: 'financial' })
        .set('Authorization', `Bearer ${partnerToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/reports/export`)
        .query({ kind: 'financial' })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const body = res.text ?? res.body.toString();
      expect(body).toContain('Net Profit (BDT minor units)');
      expect(body).toContain('"Pellets, 50kg"');
    });

    it('an unknown report kind is a 400', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/reports/export`)
        .query({ kind: 'nonsense' })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/reports/export`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
    });

    it('AC-124: a non-member is denied any export with no disclosure', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/reports/export`)
        .query({ kind: 'growth' })
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(403);
    });
  });
});
