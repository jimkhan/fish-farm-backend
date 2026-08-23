import { randomUUID } from 'node:crypto';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { join } from 'path';
import type { HarvestRecorded, MortalityRecorded, SamplingRecorded } from '@fish-farm/shared';
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
import { startTestPostgres, type DisposablePostgres } from './support/postgres-test-container';

/**
 * Stocking/Batch/Biomass e2e (TASK-019, CON-015/016/017/043, AC-062…067/070) — full MOD-02+
 * MOD-03+MOD-04 stack on a real Postgres. Mortality/Sampling/Harvest events are published
 * directly on the real `DomainEventBus` (no fake) — MOD-07, their eventual real publisher, isn't
 * built yet (ADR-015 decouples MOD-04's consumption from MOD-07's existence).
 */

function buildStockingTestAppModule() {
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
    ],
  })
  class StockingTestAppModule {}

  return StockingTestAppModule;
}

const OWNER_EMAIL = 'stocking-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const OUTSIDER_EMAIL = 'stocking-outsider@example.com';
const OUTSIDER_PASSWORD = 'outsider correct horse battery staple';

describe('Stocking/Batch/Biomass e2e (TASK-019, CON-015/016/017/043, AC-062…067/070)', () => {
  let container: DisposablePostgres;
  let dataSource: DataSource;
  let app: INestApplication;
  let events: DomainEventBus;
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
      ],
      migrations: [join(__dirname, '..', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const hasher = new Argon2PasswordHasher();
    const users = dataSource.getRepository(UserPersistenceModel);
    await users.save({
      email: OWNER_EMAIL,
      name: 'Stocking Owner',
      passwordHash: await hasher.hash(OWNER_PASSWORD),
      status: 'ACTIVE',
    });
    await users.save({
      email: OUTSIDER_EMAIL,
      name: 'Stocking Outsider',
      passwordHash: await hasher.hash(OUTSIDER_PASSWORD),
      status: 'ACTIVE',
    });

    const golda = await dataSource
      .getRepository(SpeciesPersistenceModel)
      .findOneByOrFail({ name: 'SPF Golda' });
    goldaSpeciesId = golda.id;

    const moduleRef = await Test.createTestingModule({
      imports: [buildStockingTestAppModule()],
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
    outsiderToken = await accessTokenFor(OUTSIDER_EMAIL, OUTSIDER_PASSWORD);

    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Stocking Farm', siteLat: 23.7, siteLng: 90.3 })
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

  describe('AC-062/070: POST stockings', () => {
    it('creates exactly one batch with survivalEstimate = initialCount, and stores the cost in minor units/BDT', async () => {
      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${pondId}/stockings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          speciesId: goldaSpeciesId,
          count: 5000,
          stockedOn: '2026-01-01',
          stockingCost: { amountMinor: 250000 },
        })
        .expect(201);

      expect(res.body.initialCount).toBe(5000);
      expect(res.body.survivalEstimate).toBe(5000);
      expect(res.body.cumulativeMortality).toBe(0);
      expect(res.body.latestAvgWeightG).toBeNull();

      const stockingRow = await dataSource
        .getRepository(StockingPersistenceModel)
        .findOneOrFail({ where: { pondId } });
      expect(stockingRow.stockingCostMinor).toBe(250000);
      expect(stockingRow.currency).toBe('BDT');
    });

    it('a client-supplied currency on the cost is rejected (not a user choice, ADR-018)', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${pondId}/stockings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          speciesId: goldaSpeciesId,
          count: 100,
          stockedOn: '2026-01-01',
          stockingCost: { amountMinor: 1000, currency: 'BDT' },
        })
        .expect(400);
    });

    it('rejects an unknown speciesId', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${pondId}/stockings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ speciesId: randomUUID(), count: 100, stockedOn: '2026-01-01' })
        .expect(400);
    });

    it('denies a non-member with no data disclosure', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${pondId}/stockings`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ speciesId: goldaSpeciesId, count: 100, stockedOn: '2026-01-01' })
        .expect(403);
    });
  });

  describe('CON-016/017: list/get batches', () => {
    it('lists and gets the batch just created', async () => {
      const list = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(list.body.length).toBeGreaterThan(0);

      const batchId = list.body[0].id;
      const got = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(got.body.id).toBe(batchId);
    });

    it('a batch from another project 404s (never disclosed)', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${randomUUID()}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });
  });

  describe('AC-063/064/066/067: mortality/sampling/harvest event consumption', () => {
    it('AC-063: MortalityRecorded reduces survivalEstimate', async () => {
      const stockRes = await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${pondId}/stockings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ speciesId: goldaSpeciesId, count: 1000, stockedOn: '2026-01-02' })
        .expect(201);
      const batchId = stockRes.body.id;

      const mortalityEvent: MortalityRecorded = {
        name: 'MortalityRecorded',
        eventId: randomUUID(),
        occurredAt: new Date(),
        batchId,
        count: 100,
      };
      await events.publish(mortalityEvent);

      const batch = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(batch.body.cumulativeMortality).toBe(100);
      expect(batch.body.survivalEstimate).toBe(900);

      // AC-064: redelivering the SAME event id must not double-count.
      await events.publish(mortalityEvent);
      const afterRedelivery = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(afterRedelivery.body.cumulativeMortality).toBe(100);
      expect(afterRedelivery.body.survivalEstimate).toBe(900);
    });

    it('AC-066/AC-067: SamplingRecorded then HarvestRecorded update weight/biomass and reduce remaining count', async () => {
      const stockRes = await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${pondId}/stockings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ speciesId: goldaSpeciesId, count: 2000, stockedOn: '2026-01-03' })
        .expect(201);
      const batchId = stockRes.body.id;

      const samplingEvent: SamplingRecorded = {
        name: 'SamplingRecorded',
        eventId: randomUUID(),
        occurredAt: new Date(),
        batchId,
        avgWeightG: 20,
      };
      await events.publish(samplingEvent);

      const afterSampling = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(afterSampling.body.latestAvgWeightG).toBe(20);

      const biomassAfterSampling = await request(app.getHttpServer())
        .get(`/projects/${projectId}/biomass`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const goldaBiomass = biomassAfterSampling.body.perSpecies.find(
        (s: { speciesId: string }) => s.speciesId === goldaSpeciesId,
      );
      expect(goldaBiomass.biomassKg).toBeGreaterThanOrEqual((2000 * 20) / 1000);

      const harvestEvent: HarvestRecorded = {
        name: 'HarvestRecorded',
        eventId: randomUUID(),
        occurredAt: new Date(),
        batchId,
        count: 500,
      };
      await events.publish(harvestEvent);

      const afterHarvest = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(afterHarvest.body.survivalEstimate).toBe(1500);
    });
  });

  describe('closed-project write-guard on stocking', () => {
    it('returns PROJECT_CLOSED/409', async () => {
      const project = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Soon Closed Stocking Farm', siteLat: 23.7, siteLng: 90.3 })
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
        .post(`/projects/${project.body.id}/ponds/${pond.body.id}/stockings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ speciesId: goldaSpeciesId, count: 100, stockedOn: '2026-01-01' })
        .expect(409);
      expect(res.body.code).toBe('PROJECT_CLOSED');
    });
  });
});
