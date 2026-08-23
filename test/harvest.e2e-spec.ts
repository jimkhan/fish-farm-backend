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
import { MortalityPersistenceModel } from '../src/modules/health/infrastructure/persistence/mortality.persistence-model';
import { TreatmentPersistenceModel } from '../src/modules/health/infrastructure/persistence/treatment.persistence-model';
import { MortalityHealthModule } from '../src/modules/health/health.module';
import { HarvestPersistenceModel } from '../src/modules/harvest/infrastructure/persistence/harvest.persistence-model';
import { HarvestModule } from '../src/modules/harvest/harvest.module';
import { startTestPostgres, type DisposablePostgres } from './support/postgres-test-container';

/**
 * Harvest e2e (TASK-031, CON-021, F7, AC-102/103/106, R7/R8/R9) — full MOD-02+MOD-03+MOD-04+
 * MOD-07 stack on a real Postgres.
 */

function buildHarvestTestAppModule() {
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
      MortalityHealthModule,
      HarvestModule,
    ],
  })
  class HarvestTestAppModule {}

  return HarvestTestAppModule;
}

const OWNER_EMAIL = 'harvest-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const WORKER_EMAIL = 'harvest-worker@example.com';
const WORKER_PASSWORD = 'worker correct horse battery staple';
const OUTSIDER_EMAIL = 'harvest-outsider@example.com';
const OUTSIDER_PASSWORD = 'outsider correct horse battery staple';

describe('Harvest e2e (TASK-031, CON-021, AC-101/102/103/106)', () => {
  let container: DisposablePostgres;
  let dataSource: DataSource;
  let app: INestApplication;
  let accessTokenFor: (email: string, password: string) => Promise<string>;
  let ownerToken: string;
  let workerToken: string;
  let outsiderToken: string;
  let carpSpeciesId: string;
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
        MortalityPersistenceModel,
        TreatmentPersistenceModel,
        HarvestPersistenceModel,
      ],
      migrations: [join(__dirname, '..', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const hasher = new Argon2PasswordHasher();
    const users = dataSource.getRepository(UserPersistenceModel);
    for (const [email, password, name] of [
      [OWNER_EMAIL, OWNER_PASSWORD, 'Harvest Owner'],
      [WORKER_EMAIL, WORKER_PASSWORD, 'Harvest Worker'],
      [OUTSIDER_EMAIL, OUTSIDER_PASSWORD, 'Harvest Outsider'],
    ]) {
      await users.save({ email, name, passwordHash: await hasher.hash(password), status: 'ACTIVE' });
    }

    const carp = await dataSource.getRepository(SpeciesPersistenceModel).findOneByOrFail({ name: 'Carp' });
    carpSpeciesId = carp.id;

    const moduleRef = await Test.createTestingModule({
      imports: [buildHarvestTestAppModule()],
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
      .send({ name: 'Harvest Farm', siteLat: 23.7, siteLng: 90.3 })
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

  async function stockBatch(count: number): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/projects/${projectId}/ponds/${pondId}/stockings`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ speciesId: carpSpeciesId, count, stockedOn: '2026-01-01' })
      .expect(201);
    return res.body.id;
  }

  describe('AC-102/AC-106: partial harvest reduces stock and stores revenue', () => {
    it('a Worker records a harvest — biomass reduces, revenue stored as minor units', async () => {
      const batchId = await stockBatch(1000);

      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/harvests`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          quantity: 200,
          totalWeightKg: 300,
          grade: 'LOCAL',
          harvestedOn: '2026-02-01',
          revenue: { amountMinor: 5_000_00 },
          clientMutationId: randomUUID(),
        })
        .expect(201);

      expect(res.body.quantity).toBe(200);
      expect(res.body.revenue).toEqual({ amountMinor: 500000, currency: 'BDT' });
      expect(res.body.withdrawalWarning).toBe(false);

      const batch = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(batch.body.survivalEstimate).toBe(800);
    });

    it('a harvest without revenue stores null', async () => {
      const batchId = await stockBatch(500);
      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/harvests`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          quantity: 50,
          totalWeightKg: 60,
          grade: 'LOCAL',
          harvestedOn: '2026-02-01',
          clientMutationId: randomUUID(),
        })
        .expect(201);
      expect(res.body.revenue).toBeNull();
    });

    it('ADR-010: a replayed clientMutationId returns the same harvest without double-reducing stock', async () => {
      const batchId = await stockBatch(500);
      const clientMutationId = randomUUID();
      const body = {
        quantity: 100,
        totalWeightKg: 120,
        grade: 'LOCAL',
        harvestedOn: '2026-02-01',
        clientMutationId,
      };

      const first = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/harvests`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send(body)
        .expect(201);
      const second = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/harvests`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send(body)
        .expect(201);
      expect(second.body.id).toBe(first.body.id);

      const batch = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(batch.body.survivalEstimate).toBe(400);
    });
  });

  describe('AC-103/R8: harvest exceeding remaining stock', () => {
    it('returns HARVEST_EXCEEDS_STOCK/409', async () => {
      const batchId = await stockBatch(10);
      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/harvests`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          quantity: 11,
          totalWeightKg: 20,
          grade: 'LOCAL',
          harvestedOn: '2026-02-01',
          clientMutationId: randomUUID(),
        })
        .expect(409);
      expect(res.body.code).toBe('HARVEST_EXCEEDS_STOCK');
    });
  });

  describe('AC-101/R7: withdrawal advisory', () => {
    it('an EXPORT harvest inside a treatment withdrawal window is not blocked, but is flagged', async () => {
      const batchId = await stockBatch(100);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/treatments`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ product: 'Oxytetracycline', dose: '10mg/kg', administeredOn: '2026-02-01', withdrawalDays: 14 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/harvests`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          quantity: 10,
          totalWeightKg: 20,
          grade: 'EXPORT',
          harvestedOn: '2026-02-05', // inside [2026-02-01, 2026-02-15)
          clientMutationId: randomUUID(),
        })
        .expect(201);
      expect(res.body.withdrawalWarning).toBe(true);
    });

    it('a LOCAL harvest in the same window is not flagged', async () => {
      const batchId = await stockBatch(100);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/treatments`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ product: 'Oxytetracycline', dose: '10mg/kg', administeredOn: '2026-02-01', withdrawalDays: 14 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/harvests`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          quantity: 10,
          totalWeightKg: 20,
          grade: 'LOCAL',
          harvestedOn: '2026-02-05',
          clientMutationId: randomUUID(),
        })
        .expect(201);
      expect(res.body.withdrawalWarning).toBe(false);
    });
  });

  describe('tenant isolation and closed-project guard', () => {
    it('denies a non-member with no data disclosure', async () => {
      const batchId = await stockBatch(100);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${batchId}/harvests`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ quantity: 10, totalWeightKg: 20, grade: 'LOCAL', harvestedOn: '2026-02-01', clientMutationId: randomUUID() })
        .expect(403);
    });

    it('a batch from another project 404s', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/batches/${randomUUID()}/harvests`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ quantity: 10, totalWeightKg: 20, grade: 'LOCAL', harvestedOn: '2026-02-01', clientMutationId: randomUUID() })
        .expect(404);
    });

    it('R9: harvesting on a CLOSED project returns PROJECT_CLOSED/409', async () => {
      const closedProject = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Soon Closed Harvest Farm', siteLat: 23.7, siteLng: 90.3 })
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
      await request(app.getHttpServer())
        .patch(`/projects/${closedProject.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'CLOSED' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/projects/${closedProject.body.id}/batches/${closedStocking.body.id}/harvests`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ quantity: 10, totalWeightKg: 20, grade: 'LOCAL', harvestedOn: '2026-02-01', clientMutationId: randomUUID() })
        .expect(409);
      expect(res.body.code).toBe('PROJECT_CLOSED');
    });
  });
});
