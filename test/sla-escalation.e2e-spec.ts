import { randomUUID } from 'node:crypto';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { join } from 'path';
import type { WaterEmergencyRaised } from '@fish-farm/shared';
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
import {
  DeliveryResult,
  FALLBACK_NOTIFICATION_CHANNEL,
  NOTIFICATION_CHANNEL,
  NotificationChannel,
  NotificationPayload,
} from '../src/modules/notifications/domain/notification-channel.port';
import { AlertPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/alert.persistence-model';
import { DeliveryAttemptPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/delivery-attempt.persistence-model';
import { DeviceTokenPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/device-token.persistence-model';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';
import { SlaEscalationScheduler } from '../src/modules/notifications/application/sla-escalation.scheduler';
import { ProjectPersistenceModel } from '../src/modules/projects/infrastructure/persistence/project.persistence-model';
import { ProjectsModule } from '../src/modules/projects/projects.module';
import { startTestPostgres, type DisposablePostgres } from './support/postgres-test-container';

/**
 * Critical delivery retry/fallback + SLA escalation e2e (TASK-017, CON-039, AC-052/054) — full
 * MOD-02+MOD-03+MOD-09 stack on a real Postgres. `NOTIFICATION_CHANNEL`/
 * `FALLBACK_NOTIFICATION_CHANNEL` are overridden with in-memory fakes whose success/failure is
 * controlled per test (module doc's own testing note sanctions this — "FCM adapter (faked)
 * delivery") — everything else (retry loop, fallback wiring, SLA query, escalation) is real.
 * `WaterEmergencyRaised` is published directly on the real bus — its real producer (TASK-024,
 * emergency flow) isn't built yet, same established pattern as TASK-015/019's own e2e suites.
 */

class FakeChannel implements NotificationChannel {
  readonly calls: { target: string; payload: NotificationPayload }[] = [];
  result: DeliveryResult = { success: true };

  constructor(public readonly name: 'FCM' | 'SMS') {}

  async send(target: string, payload: NotificationPayload): Promise<DeliveryResult> {
    this.calls.push({ target, payload });
    return this.result;
  }
}

function buildSlaTestAppModule() {
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
    ],
  })
  class SlaTestAppModule {}

  return SlaTestAppModule;
}

const OWNER_EMAIL = 'sla-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';

describe('Critical delivery retry/fallback + SLA escalation e2e (TASK-017, CON-039, AC-052/054)', () => {
  let container: DisposablePostgres;
  let dataSource: DataSource;
  let app: INestApplication;
  let events: DomainEventBus;
  let scheduler: SlaEscalationScheduler;
  let fakePrimary: FakeChannel;
  let fakeFallback: FakeChannel;
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
      ],
      migrations: [join(__dirname, '..', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const hasher = new Argon2PasswordHasher();
    await dataSource.getRepository(UserPersistenceModel).save({
      email: OWNER_EMAIL,
      name: 'SLA Owner',
      passwordHash: await hasher.hash(OWNER_PASSWORD),
      status: 'ACTIVE',
    });

    fakePrimary = new FakeChannel('FCM');
    fakeFallback = new FakeChannel('SMS');

    const moduleRef = await Test.createTestingModule({
      imports: [buildSlaTestAppModule()],
    })
      .overrideProvider(NOTIFICATION_CHANNEL)
      .useValue(fakePrimary)
      .overrideProvider(FALLBACK_NOTIFICATION_CHANNEL)
      .useValue(fakeFallback)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    events = moduleRef.get(DomainEventBus);
    scheduler = moduleRef.get(SlaEscalationScheduler);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
      .expect(200);
    ownerToken = login.body.accessToken;

    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'SLA Farm', siteLat: 23.7, siteLng: 90.3 })
      .expect(201);
    projectId = project.body.id;

    await request(app.getHttpServer())
      .post('/notifications/devices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fcmToken: 'fcm-sla-owner-device', platform: 'ANDROID' })
      .expect(204);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  describe('AC-052: retry with backoff, then fallback to the next channel', () => {
    it('retries the primary channel 3x on failure, then falls back to SMS, and the alert still reaches SENT', async () => {
      fakePrimary.result = { success: false, error: 'FCM down' };
      fakeFallback.result = { success: false, error: 'CHANNEL_UNAVAILABLE' };
      fakePrimary.calls.length = 0;
      fakeFallback.calls.length = 0;

      const emergency: WaterEmergencyRaised = {
        name: 'WaterEmergencyRaised',
        eventId: randomUUID(),
        occurredAt: new Date(),
        projectId,
        sourceRef: `pond-retry-${randomUUID()}`,
        message: 'DO crash — retry test',
      };
      await events.publish(emergency);

      expect(fakePrimary.calls.length).toBe(3);
      expect(fakePrimary.calls.every((c) => c.target === 'fcm-sla-owner-device')).toBe(true);
      expect(fakeFallback.calls.length).toBe(1);
      expect(fakeFallback.calls[0].target).toBe('fcm-sla-owner-device');

      const alerts = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const alert = alerts.body.find((a: { message: string }) => a.message.includes('retry test'));
      expect(alert.state).toBe('SENT');
      expect(alert.escalatedAt).toBeNull();
    });

    it('a fallback that succeeds is reported as overall delivered — no crash, no extra retries', async () => {
      fakePrimary.result = { success: false, error: 'FCM down' };
      fakeFallback.result = { success: true };
      fakePrimary.calls.length = 0;
      fakeFallback.calls.length = 0;

      const emergency: WaterEmergencyRaised = {
        name: 'WaterEmergencyRaised',
        eventId: randomUUID(),
        occurredAt: new Date(),
        projectId,
        sourceRef: `pond-fallback-ok-${randomUUID()}`,
        message: 'DO crash — fallback ok',
      };
      await events.publish(emergency);

      expect(fakePrimary.calls.length).toBe(3);
      expect(fakeFallback.calls.length).toBe(1);
    });
  });

  describe('AC-054: SLA escalation', () => {
    it('re-notifies and marks escalatedAt for a CRITICAL alert past the SLA, still unacknowledged', async () => {
      fakePrimary.result = { success: true };
      fakePrimary.calls.length = 0;

      const emergency: WaterEmergencyRaised = {
        name: 'WaterEmergencyRaised',
        eventId: randomUUID(),
        occurredAt: new Date(),
        projectId,
        sourceRef: `pond-sla-${randomUUID()}`,
        message: 'DO crash — SLA test',
      };
      await events.publish(emergency);

      const beforeList = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const alertId = beforeList.body.find((a: { message: string }) => a.message.includes('SLA test')).id;

      // Backdate raised_at past the 15-minute SLA — the API never lets a client set the past.
      await dataSource
        .getRepository(AlertPersistenceModel)
        .update({ id: alertId }, { raisedAt: new Date(Date.now() - 20 * 60_000) });

      fakePrimary.calls.length = 0;
      await scheduler.scan();

      expect(fakePrimary.calls.some((c) => c.target === 'fcm-sla-owner-device')).toBe(true);

      const afterList = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const updated = afterList.body.find((a: { id: string }) => a.id === alertId);
      expect(updated.escalatedAt).not.toBeNull();
    });

    it('does not escalate an alert that was already acknowledged before its SLA breach', async () => {
      fakePrimary.result = { success: true };

      const emergency: WaterEmergencyRaised = {
        name: 'WaterEmergencyRaised',
        eventId: randomUUID(),
        occurredAt: new Date(),
        projectId,
        sourceRef: `pond-acked-${randomUUID()}`,
        message: 'DO crash — acked before SLA',
      };
      await events.publish(emergency);

      const list = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const alertId = list.body.find((a: { message: string }) => a.message.includes('acked before SLA')).id;

      await request(app.getHttpServer())
        .post(`/projects/${projectId}/alerts/${alertId}/acknowledge`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      await dataSource
        .getRepository(AlertPersistenceModel)
        .update({ id: alertId }, { raisedAt: new Date(Date.now() - 20 * 60_000) });

      fakePrimary.calls.length = 0;
      await scheduler.scan();

      const dispatchedToThisAlert = fakePrimary.calls.some((c) =>
        JSON.stringify(c.payload).includes(alertId),
      );
      expect(dispatchedToThisAlert).toBe(false);

      const after = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const updated = after.body.find((a: { id: string }) => a.id === alertId);
      expect(updated.escalatedAt).toBeNull();
    });
  });
});
