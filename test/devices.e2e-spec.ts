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
import {
  DeliveryResult,
  NOTIFICATION_CHANNEL,
  NotificationChannel,
  NotificationPayload,
} from '../src/modules/notifications/domain/notification-channel.port';
import { AlertPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/alert.persistence-model';
import { DeliveryAttemptPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/delivery-attempt.persistence-model';
import { DeviceTokenPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/device-token.persistence-model';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';
import { InventoryItemPersistenceModel } from '../src/modules/inventory/infrastructure/persistence/inventory-item.persistence-model';
import { InventoryTxnPersistenceModel } from '../src/modules/inventory/infrastructure/persistence/inventory-txn.persistence-model';
import { InventoryModule } from '../src/modules/inventory/inventory.module';
import { ProjectPersistenceModel } from '../src/modules/projects/infrastructure/persistence/project.persistence-model';
import { ProjectsModule } from '../src/modules/projects/projects.module';
import { startTestPostgres, type DisposablePostgres } from './support/postgres-test-container';

/**
 * Device registration + dispatch e2e (TASK-016, CON-045, AC-053/057) — full MOD-02+MOD-03+MOD-05+
 * MOD-09 stack on a real Postgres. `NOTIFICATION_CHANNEL` is overridden with an in-memory fake
 * (module doc's own testing note: "FCM adapter (faked) delivery") — nothing else is faked: a real
 * `LowStock` crossing (TASK-020) publishes a real `AlertRaised`, consumed by this task's real
 * `OnAlertRaisedHandler`, which resolves real recipients and dispatches through the fake channel.
 */

class FakeNotificationChannel implements NotificationChannel {
  readonly name = 'FCM' as const;
  readonly sent: { target: string; payload: NotificationPayload }[] = [];

  async send(target: string, payload: NotificationPayload): Promise<DeliveryResult> {
    this.sent.push({ target, payload });
    return { success: true };
  }
}

function buildDevicesTestAppModule() {
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
      NotificationsModule,
      InventoryModule,
    ],
  })
  class DevicesTestAppModule {}

  return DevicesTestAppModule;
}

const OWNER_EMAIL = 'devices-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';

describe('Device registration + dispatch e2e (TASK-016, CON-045, AC-053/057)', () => {
  let container: DisposablePostgres;
  let dataSource: DataSource;
  let app: INestApplication;
  let fakeChannel: FakeNotificationChannel;
  let ownerToken: string;
  let projectId: string;

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
        AlertPersistenceModel,
        DeviceTokenPersistenceModel,
        DeliveryAttemptPersistenceModel,
        InventoryItemPersistenceModel,
        InventoryTxnPersistenceModel,
      ],
      migrations: [join(__dirname, '..', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const hasher = new Argon2PasswordHasher();
    await dataSource.getRepository(UserPersistenceModel).save({
      email: OWNER_EMAIL,
      name: 'Devices Owner',
      passwordHash: await hasher.hash(OWNER_PASSWORD),
      status: 'ACTIVE',
    });

    fakeChannel = new FakeNotificationChannel();
    const moduleRef = await Test.createTestingModule({
      imports: [buildDevicesTestAppModule()],
    })
      .overrideProvider(NOTIFICATION_CHANNEL)
      .useValue(fakeChannel)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
      .expect(200);
    ownerToken = login.body.accessToken;

    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Devices Farm', siteLat: 23.7, siteLng: 90.3 })
      .expect(201);
    projectId = project.body.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  describe('CON-045: register device', () => {
    it('AC-053: registers a device token — 204 No Content', async () => {
      await request(app.getHttpServer())
        .post('/notifications/devices')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ fcmToken: 'fcm-owner-device-1', platform: 'ANDROID' })
        .expect(204);
    });

    it('a missing token is rejected (400)', async () => {
      await request(app.getHttpServer())
        .post('/notifications/devices')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ platform: 'ANDROID' })
        .expect(400);
    });

    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/notifications/devices')
        .send({ fcmToken: 'fcm-anonymous' })
        .expect(401);
    });
  });

  describe('AC-053: real dispatch through the (faked) channel drives RAISED→SENT', () => {
    it('a real LowStock crossing dispatches to the registered device and the alert becomes SENT', async () => {
      const item = await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Dispatch Test Feed', unit: 'kg', lowStockThreshold: 20 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory/${item.body.id}/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ delta: 25, reason: 'receipt' })
        .expect(201);

      const beforeCount = fakeChannel.sent.length;
      // 25 -> 15: crosses the threshold of 20 -> LowStock -> AlertRaised -> dispatch.
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory/${item.body.id}/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ delta: -10, reason: 'deduction' })
        .expect(201);

      expect(fakeChannel.sent.length).toBeGreaterThan(beforeCount);
      const dispatchedToOwnerDevice = fakeChannel.sent.some(
        (s) => s.target === 'fcm-owner-device-1',
      );
      expect(dispatchedToOwnerDevice).toBe(true);

      const alerts = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const lowStockAlert = alerts.body.find(
        (a: { type: string; message: string }) =>
          a.type === 'LOW_STOCK' && a.message.includes('Dispatch Test Feed'),
      );
      expect(lowStockAlert).toBeDefined();
      expect(lowStockAlert.state).toBe('SENT');
    });
  });
});
