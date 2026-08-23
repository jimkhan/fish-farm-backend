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
import { GrowthModule } from '../src/modules/growth/growth.module';
import { SamplingPersistenceModel } from '../src/modules/growth/infrastructure/persistence/sampling.persistence-model';
import { PondFeedAccumulatorPersistenceModel } from '../src/modules/growth/infrastructure/persistence/pond-feed-accumulator.persistence-model';
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
import { FeedingLogPersistenceModel } from '../src/modules/feed/infrastructure/persistence/feeding-log.persistence-model';
import { FeedModule } from '../src/modules/feed/feed.module';
import { HarvestPersistenceModel } from '../src/modules/harvest/infrastructure/persistence/harvest.persistence-model';
import { HarvestModule } from '../src/modules/harvest/harvest.module';
import { MortalityPersistenceModel } from '../src/modules/health/infrastructure/persistence/mortality.persistence-model';
import { TreatmentPersistenceModel } from '../src/modules/health/infrastructure/persistence/treatment.persistence-model';
import { MortalityHealthModule } from '../src/modules/health/health.module';
import { WaterReadingPersistenceModel } from '../src/modules/water/infrastructure/persistence/water-reading.persistence-model';
import { WaterThresholdPersistenceModel } from '../src/modules/water/infrastructure/persistence/water-threshold.persistence-model';
import { PondActionPersistenceModel } from '../src/modules/water/infrastructure/persistence/pond-action.persistence-model';
import { AlertPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/alert.persistence-model';
import { DeliveryAttemptPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/delivery-attempt.persistence-model';
import { DeviceTokenPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/device-token.persistence-model';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';
import { startTestPostgres, type DisposablePostgres } from './support/postgres-test-container';

/**
 * Sampling/Growth e2e (TASK-029, CON-020/052, AC-096/097) — full MOD-02+MOD-03+MOD-04 stack on a
 * real Postgres. Recording a sampling here genuinely emits `SamplingRecorded` — the fourth event
 * this session-batch's real producer replaces a synthetic e2e publish with (TASK-019's own
 * `OnSamplingHandler` was built against a synthetic event; this is its first real caller).
 */

function buildGrowthTestAppModule() {
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
      InventoryModule,
      FeedModule,
      MortalityHealthModule,
      HarvestModule,
      GrowthModule,
    ],
  })
  class GrowthTestAppModule {}

  return GrowthTestAppModule;
}

const OWNER_EMAIL = 'growth-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const OUTSIDER_EMAIL = 'growth-outsider@example.com';
const OUTSIDER_PASSWORD = 'outsider correct horse battery staple';

describe('Sampling/Growth e2e (TASK-029, CON-020/052, AC-096/097)', () => {
  let container: DisposablePostgres;
  let dataSource: DataSource;
  let app: INestApplication;
  let accessTokenFor: (email: string, password: string) => Promise<string>;
  let ownerToken: string;
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
        SamplingPersistenceModel,
        PondFeedAccumulatorPersistenceModel,
        InventoryItemPersistenceModel,
        InventoryTxnPersistenceModel,
        FeedingLogPersistenceModel,
        HarvestPersistenceModel,
        MortalityPersistenceModel,
        TreatmentPersistenceModel,
        WaterReadingPersistenceModel,
        WaterThresholdPersistenceModel,
        PondActionPersistenceModel,
        AlertPersistenceModel,
        DeliveryAttemptPersistenceModel,
        DeviceTokenPersistenceModel,
      ],
      migrations: [join(__dirname, '..', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const hasher = new Argon2PasswordHasher();
    const users = dataSource.getRepository(UserPersistenceModel);
    for (const [email, password] of [
      [OWNER_EMAIL, OWNER_PASSWORD],
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
      imports: [buildGrowthTestAppModule()],
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
    outsiderToken = await accessTokenFor(OUTSIDER_EMAIL, OUTSIDER_PASSWORD);

    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Growth Farm', siteLat: 23.7, siteLng: 90.3 })
      .expect(201);
    projectId = project.body.id;

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

  describe('CON-020: record sampling', () => {
    it('AC-096: persists the sampling and — via the real SamplingRecorded pipeline — updates the batch latest weight', async () => {
      const batchId = await newBatch(1000, '2026-01-01');

      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/samplings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sampleSize: 30, avgWeightG: 12.5, sampledOn: '2026-02-01', clientMutationId: 'cmid-1' })
        .expect(201);
      expect(res.body.avgWeightG).toBe(12.5);

      const batch = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(batch.body.latestAvgWeightG).toBe(12.5);
    });

    it('ADR-010: replaying the same clientMutationId is idempotent', async () => {
      const batchId = await newBatch(1000, '2026-01-01');
      const body = { sampleSize: 20, avgWeightG: 8, sampledOn: '2026-02-01', clientMutationId: 'cmid-dup' };

      const first = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/samplings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(body)
        .expect(201);
      const second = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/samplings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(body)
        .expect(201);
      expect(second.body.id).toBe(first.body.id);
    });

    it('a non-positive avgWeightG is rejected (400)', async () => {
      const batchId = await newBatch(1000, '2026-01-01');
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/samplings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sampleSize: 30, avgWeightG: 0, sampledOn: '2026-02-01', clientMutationId: 'cmid-bad' })
        .expect(400);
    });

    it('denies a non-member with no data disclosure', async () => {
      const batchId = await newBatch(1000, '2026-01-01');
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/samplings`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ sampleSize: 30, avgWeightG: 12, sampledOn: '2026-02-01', clientMutationId: 'cmid-outsider' })
        .expect(403);
    });
  });

  describe('CON-052: growth (ADG/SGR)', () => {
    it('R5: fewer than 2 samplings returns null ADG/SGR, not a fabricated number', async () => {
      const batchId = await newBatch(1000, '2026-01-01');
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/samplings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sampleSize: 30, avgWeightG: 10, sampledOn: '2026-02-01', clientMutationId: 'cmid-only-one' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}/growth`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(res.body.adgGPerDay).toBeNull();
      expect(res.body.sgrPercentPerDay).toBeNull();
    });

    it('AC-097: two consecutive samplings yield real ADG/SGR per species', async () => {
      const batchId = await newBatch(1000, '2026-01-01');
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/samplings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sampleSize: 30, avgWeightG: 10, sampledOn: '2026-02-01', clientMutationId: 'cmid-a' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/samplings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sampleSize: 30, avgWeightG: 20, sampledOn: '2026-02-11', clientMutationId: 'cmid-b' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}/growth`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(res.body.speciesId).toBe(goldaSpeciesId);
      expect(res.body.adgGPerDay).toBeCloseTo(1, 5); // (20-10)/10 days
      expect(res.body.growthAnomaly).toBe(false);
    });

    it('edge case 5: a declining weight flags growthAnomaly, not hidden', async () => {
      const batchId = await newBatch(1000, '2026-01-01');
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/samplings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sampleSize: 30, avgWeightG: 20, sampledOn: '2026-02-01', clientMutationId: 'cmid-decline-1' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/samplings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sampleSize: 30, avgWeightG: 15, sampledOn: '2026-02-06', clientMutationId: 'cmid-decline-2' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}/growth`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(res.body.adgGPerDay).toBeLessThan(0);
      expect(res.body.growthAnomaly).toBe(true);
    });
  });

  describe('R9: closed-project write-guard', () => {
    it('samplings on a CLOSED project return PROJECT_CLOSED/409', async () => {
      const project = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Soon Closed Growth Farm', siteLat: 23.7, siteLng: 90.3 })
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
        .post(`/projects/${project.body.id}/batches/${stocking.body.id}/samplings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sampleSize: 30, avgWeightG: 12, sampledOn: '2026-02-01', clientMutationId: 'cmid-closed' })
        .expect(409);
      expect(res.body.code).toBe('PROJECT_CLOSED');
    });
  });

  describe('CON-058: GET /projects/{projectId}/ponds/{pondId}/fcr (TASK-030, AC-098/099)', () => {
    async function newFcrPond(): Promise<string> {
      const pond = await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: `FCR Pond ${Date.now()}-${Math.random()}`, area: 8 })
        .expect(201);
      return pond.body.id;
    }

    async function newFeedItem(): Promise<string> {
      const item = await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        // SPF Golda (goldaSpeciesId) is PRAWN-category → feedTypeForSpeciesCategory expects SINKING.
        .send({ name: `Sinking pellets ${Date.now()}-${Math.random()}`, feedType: 'SINKING', unit: 'kg' })
        .expect(201);
      const itemId = item.body.id;
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory/${itemId}/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ delta: 1000, reason: 'Initial stock' })
        .expect(201);
      return itemId;
    }

    it('AC-098/099: computes real pond-level FCR (feed ÷ gain incl. harvested weight) and per-batch survival rate', async () => {
      const fcrPondId = await newFcrPond();
      const feedItemId = await newFeedItem();

      const stocking = await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${fcrPondId}/stockings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ speciesId: goldaSpeciesId, count: 1000, stockedOn: '2026-01-01' })
        .expect(201);
      const batchId = stocking.body.id;

      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/feedings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ inventoryItemId: feedItemId, qtyKg: 50, fedAt: '2026-01-20T00:00:00.000Z', clientMutationId: 'fcr-feed-1' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/samplings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sampleSize: 30, avgWeightG: 50, sampledOn: '2026-02-01', clientMutationId: 'fcr-sample-1' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/samplings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ sampleSize: 30, avgWeightG: 150, sampledOn: '2026-03-01', clientMutationId: 'fcr-sample-2' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/harvests`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ quantity: 100, totalWeightKg: 15, grade: 'LOCAL', harvestedOn: '2026-03-15', clientMutationId: 'fcr-harvest-1' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/ponds/${fcrPondId}/fcr`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      // survivalEstimate = 1000 - 0 - 100 = 900; gain = 900*(150-50)/1000 + 15 = 105kg
      expect(res.body.totalFeedKg).toBe(50);
      expect(res.body.biomassGainKg).toBeCloseTo(105);
      expect(res.body.fcr).toBeCloseTo(50 / 105);
      expect(res.body.batches).toEqual([{ batchId, speciesId: goldaSpeciesId, survivalRate: 0.9 }]);
    });

    it('edge case 2: fewer than 2 samplings → fcr/biomassGainKg are null, never fabricated', async () => {
      const fcrPondId = await newFcrPond();
      const feedItemId = await newFeedItem();
      const stocking = await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${fcrPondId}/stockings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ speciesId: goldaSpeciesId, count: 500, stockedOn: '2026-01-01' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${stocking.body.id}/feedings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ inventoryItemId: feedItemId, qtyKg: 20, fedAt: '2026-01-20T00:00:00.000Z', clientMutationId: 'fcr-feed-2' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/ponds/${fcrPondId}/fcr`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.totalFeedKg).toBe(20);
      expect(res.body.biomassGainKg).toBeNull();
      expect(res.body.fcr).toBeNull();
      expect(res.body.batches).toEqual([{ batchId: stocking.body.id, speciesId: goldaSpeciesId, survivalRate: 1 }]);
    });

    it('a non-member is denied with no data disclosure, and a pond from another project 404s', async () => {
      const fcrPondId = await newFcrPond();
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/ponds/${fcrPondId}/fcr`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(403);

      const otherProject = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ name: 'Someone Else FCR Farm', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);
      await request(app.getHttpServer())
        .get(`/projects/${otherProject.body.id}/ponds/${fcrPondId}/fcr`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(404);
    });
  });
});
