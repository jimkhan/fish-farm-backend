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
import { SamplingPersistenceModel } from '../src/modules/growth/infrastructure/persistence/sampling.persistence-model';
import { GrowthModule } from '../src/modules/growth/growth.module';
import { AlertPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/alert.persistence-model';
import { DeliveryAttemptPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/delivery-attempt.persistence-model';
import { DeviceTokenPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/device-token.persistence-model';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';
import {
  DeliveryResult,
  NOTIFICATION_CHANNEL,
  NotificationChannel,
  NotificationPayload,
} from '../src/modules/notifications/domain/notification-channel.port';
import { WaterReadingPersistenceModel } from '../src/modules/water/infrastructure/persistence/water-reading.persistence-model';
import { WaterThresholdPersistenceModel } from '../src/modules/water/infrastructure/persistence/water-threshold.persistence-model';
import { WaterModule } from '../src/modules/water/water.module';
import { FeedModule } from '../src/modules/feed/feed.module';
import { FeedingReminderScheduler } from '../src/modules/feed/application/feeding-reminder.scheduler';
import { startTestPostgres, type DisposablePostgres } from './support/postgres-test-container';

/** A fake `NOTIFICATION_CHANNEL` (module doc's own testing note sanctions this — "FCM adapter (faked) delivery"). */
class FakeNotificationChannel implements NotificationChannel {
  readonly name = 'FCM';
  readonly sent: { target: string; payload: NotificationPayload }[] = [];

  async send(target: string, payload: NotificationPayload): Promise<DeliveryResult> {
    this.sent.push({ target, payload });
    return { success: true };
  }
}

/**
 * Feed plan e2e (TASK-021, CON-018a, AC-071/072/073) — full MOD-02+MOD-03+MOD-04+MOD-06+MOD-05
 * stack on a real Postgres. Sampling is recorded through GrowthModule's real endpoint (TASK-029),
 * consumed by PondsModule's already-built `OnSamplingHandler` — no synthetic `bus.publish()`.
 */

function buildFeedTestAppModule() {
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
      GrowthModule,
      NotificationsModule,
      WaterModule,
      FeedModule,
    ],
  })
  class FeedTestAppModule {}

  return FeedTestAppModule;
}

const OWNER_EMAIL = 'feed-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const WORKER_EMAIL = 'feed-worker@example.com';
const WORKER_PASSWORD = 'worker correct horse battery staple';
const OUTSIDER_EMAIL = 'feed-outsider@example.com';
const OUTSIDER_PASSWORD = 'outsider correct horse battery staple';

describe('Feed plan e2e (TASK-021, CON-018a, AC-071/072/073/081)', () => {
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
  let fakeChannel: FakeNotificationChannel;
  let reminderScheduler: FeedingReminderScheduler;

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
        WaterReadingPersistenceModel,
        WaterThresholdPersistenceModel,
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
    for (const [email, password, name] of [
      [OWNER_EMAIL, OWNER_PASSWORD, 'Feed Owner'],
      [WORKER_EMAIL, WORKER_PASSWORD, 'Feed Worker'],
      [OUTSIDER_EMAIL, OUTSIDER_PASSWORD, 'Feed Outsider'],
    ]) {
      await users.save({ email, name, passwordHash: await hasher.hash(password), status: 'ACTIVE' });
    }

    const carp = await dataSource.getRepository(SpeciesPersistenceModel).findOneByOrFail({ name: 'Carp' });
    carpSpeciesId = carp.id;

    fakeChannel = new FakeNotificationChannel();
    const moduleRef = await Test.createTestingModule({
      imports: [buildFeedTestAppModule()],
    })
      .overrideProvider(NOTIFICATION_CHANNEL)
      .useValue(fakeChannel)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    reminderScheduler = moduleRef.get(FeedingReminderScheduler);

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
      .send({ name: 'Feed Farm', siteLat: 23.7, siteLng: 90.3 })
      .expect(201);
    projectId = project.body.id;

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: WORKER_EMAIL, role: 'WORKER' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/notifications/devices')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ fcmToken: 'fcm-feed-worker-device', platform: 'ANDROID' })
      .expect(204);

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

  async function recordSampling(batchId: string, avgWeightG: number): Promise<void> {
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/batches/${batchId}/samplings`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        sampleSize: 30,
        avgWeightG,
        sampledOn: '2026-01-05',
        clientMutationId: randomUUID(),
      })
      .expect(201);
  }

  describe('AC-072/R2: no sampling yet', () => {
    it('returns SAMPLING_REQUIRED, never a fabricated quota', async () => {
      const batchId = await stockBatch(1000);

      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}/feed-plan`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(409);
      expect(res.body.code).toBe('SAMPLING_REQUIRED');
    });
  });

  describe('AC-071: quota = biomass × BW% band, split by feed type', () => {
    it('computes a FLOATING line for a Carp (FISH) batch', async () => {
      const batchId = await stockBatch(1000);
      await recordSampling(batchId, 50); // 20–100g band → 5%; biomass = 1000×50g/1000 = 50kg

      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}/feed-plan`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.batchId).toBe(batchId);
      expect(res.body.totalKg).toBeCloseTo(2.5);
      expect(res.body.adjustedForTempDo).toBe(false);
      expect(res.body.adjustmentReason).toBeNull();
      expect(res.body.lines).toEqual([{ feedType: 'FLOATING', kg: expect.closeTo(2.5) }]);
    });
  });

  describe('AC-073/R3: temp/DO adjustment', () => {
    it('a critical DO reading reduces the quota to zero with an explicit reason', async () => {
      const batchId = await stockBatch(1000);
      await recordSampling(batchId, 50);

      await request(app.getHttpServer())
        .post(`/projects/${projectId}/ponds/${pondId}/water-readings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          parameter: 'DO',
          value: 2, // below the seeded critical threshold (3)
          readAt: new Date().toISOString(),
          clientMutationId: randomUUID(),
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}/feed-plan`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.adjustedForTempDo).toBe(true);
      expect(res.body.totalKg).toBe(0);
      expect(res.body.adjustmentReason).toMatch(/dissolved oxygen/i);
      expect(res.body.lines[0].kg).toBe(0);
    });
  });

  describe('tenant isolation', () => {
    it('denies a non-member with no data disclosure', async () => {
      const batchId = await stockBatch(1000);
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${batchId}/feed-plan`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(403);
    });

    it('a batch from another project 404s', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/batches/${randomUUID()}/feed-plan`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });
  });

  describe('AC-081: feeding reminder scheduler', () => {
    it('delivers a real push to the registered Worker device for an ACTIVE batch, never to the Owner', async () => {
      await stockBatch(1000); // ACTIVE batch, Carp (FISH) → FLOATING
      fakeChannel.sent.length = 0;

      await reminderScheduler.remind();

      const toWorker = fakeChannel.sent.filter((s) => s.target === 'fcm-feed-worker-device');
      expect(toWorker.length).toBeGreaterThan(0);
      expect(toWorker[0].payload.data).toEqual(
        expect.objectContaining({ projectId, feedType: 'FLOATING' }),
      );
    });
  });
});
