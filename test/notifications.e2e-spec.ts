import { randomUUID } from 'node:crypto';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { join } from 'path';
import type { WaterEmergencyRaised, WaterThresholdBreached } from '@fish-farm/shared';
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
import { AlertPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/alert.persistence-model';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';
import { ProjectPersistenceModel } from '../src/modules/projects/infrastructure/persistence/project.persistence-model';
import { ProjectsModule } from '../src/modules/projects/projects.module';
import { startTestPostgres, type DisposablePostgres } from './support/postgres-test-container';

/**
 * Alert engine e2e (TASK-015, CON-038/039, AC-050/051/055/056/058/059) — full MOD-02+MOD-03+
 * MOD-09 stack on a real Postgres. Source events (`WaterThresholdBreached`/`WaterEmergencyRaised`)
 * are published directly on the real `DomainEventBus` — MOD-06, their eventual real publisher,
 * isn't built yet (ADR-015 decouples MOD-09's consumption from MOD-06's existence).
 */

function buildNotificationsTestAppModule() {
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
  class NotificationsTestAppModule {}

  return NotificationsTestAppModule;
}

const OWNER_EMAIL = 'alerts-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const WORKER_EMAIL = 'alerts-worker@example.com';
const WORKER_PASSWORD = 'worker correct horse battery staple';
const PARTNER_EMAIL = 'alerts-partner@example.com';
const PARTNER_PASSWORD = 'partner correct horse battery staple';
const OUTSIDER_EMAIL = 'alerts-outsider@example.com';
const OUTSIDER_PASSWORD = 'outsider correct horse battery staple';

describe('Alerts e2e (TASK-015, CON-038/039, AC-050/051/055/056/058/059)', () => {
  let container: DisposablePostgres;
  let dataSource: DataSource;
  let app: INestApplication;
  let events: DomainEventBus;
  let accessTokenFor: (email: string, password: string) => Promise<string>;
  let ownerToken: string;
  let workerToken: string;
  let partnerToken: string;
  let outsiderToken: string;
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
      await users.save({
        email,
        name: email,
        passwordHash: await hasher.hash(password),
        status: 'ACTIVE',
      });
    }

    const moduleRef = await Test.createTestingModule({
      imports: [buildNotificationsTestAppModule()],
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
      .send({ name: 'Alerts Farm', siteLat: 23.7, siteLng: 90.3 })
      .expect(201);
    projectId = project.body.id;

    // Reuses TASK-010's real invite endpoint end-to-end.
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
    workerToken = await accessTokenFor(WORKER_EMAIL, WORKER_PASSWORD);
    partnerToken = await accessTokenFor(PARTNER_EMAIL, PARTNER_PASSWORD);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  describe('AC-050/055/058: raising, debounce, and idempotency', () => {
    it('AC-050: a subscribed domain event raises an Alert of the correct type/severity, then TASK-016 dispatch moves it to SENT', async () => {
      const event: WaterThresholdBreached = {
        name: 'WaterThresholdBreached',
        eventId: randomUUID(),
        occurredAt: new Date(),
        projectId,
        sourceRef: 'pond-a',
        severity: 'WARNING',
        message: 'DO slightly low',
      };
      await events.publish(event);

      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const alert = res.body.find((a: { sourceRef?: string; message: string }) =>
        a.message.includes('DO slightly low'),
      );
      expect(alert).toBeDefined();
      expect(alert.type).toBe('WATER_THRESHOLD');
      expect(alert.severity).toBe('WARNING');
      // TASK-016: OnAlertRaisedHandler reacts to this module's own AlertRaised (published
      // synchronously within events.publish() above) and drives RAISED→SENT — the transition
      // TASK-015's own state-machine doc comment always anticipated ("the only thing that would
      // drive SENT is TASK-016's job"). No device is registered for this owner in this test app,
      // so dispatch has nothing to send to, but the alert still moves to SENT (an attempt was
      // made) per OnAlertRaisedHandler's own contract.
      expect(alert.state).toBe('SENT');
    });

    it('AC-058: redelivering the identical event twice yields exactly one alert', async () => {
      const before = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const beforeCount = before.body.length;

      const event: WaterThresholdBreached = {
        name: 'WaterThresholdBreached',
        eventId: randomUUID(),
        occurredAt: new Date(),
        projectId,
        sourceRef: 'pond-b',
        severity: 'WARNING',
        message: 'Low DO at pond B',
      };
      await events.publish(event);
      // Redelivered with a DIFFERENT eventId (at-least-once bus semantics) but the same
      // (project, type, sourceRef) — dedup is by that key, not by eventId.
      await events.publish({ ...event, eventId: randomUUID() });

      const after = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(after.body.length).toBe(beforeCount + 1);
    });

    it('AC-055/R4: a higher-severity repeat uplifts the existing alert instead of creating a duplicate', async () => {
      const sourceRef = `pond-c-${randomUUID()}`;
      const warning: WaterThresholdBreached = {
        name: 'WaterThresholdBreached',
        eventId: randomUUID(),
        occurredAt: new Date(),
        projectId,
        sourceRef,
        severity: 'WARNING',
        message: 'DO trending down',
      };
      const critical: WaterThresholdBreached = {
        name: 'WaterThresholdBreached',
        eventId: randomUUID(),
        occurredAt: new Date(),
        projectId,
        sourceRef,
        severity: 'CRITICAL',
        message: 'DO critical',
      };
      await events.publish(warning);
      await events.publish(critical);

      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const matching = res.body.filter((a: { message: string }) =>
        a.message.includes('DO trending down') || a.message.includes('DO critical'),
      );
      expect(matching).toHaveLength(1);
      expect(matching[0].severity).toBe('CRITICAL');
    });
  });

  describe('AC-056: scoped recipient/visibility — a non-member neither sees nor acts on the alert', () => {
    it('an outsider cannot list alerts for a project they are not a member of', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(403);
    });
  });

  describe('AC-051/059: acknowledge authorization and idempotency', () => {
    it('AC-059: a Partner cannot acknowledge any alert', async () => {
      const list = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const alertId = list.body[0].id;

      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/alerts/${alertId}/acknowledge`)
        .set('Authorization', `Bearer ${partnerToken}`)
        .expect(403);
      expect(res.body.message).toBe('Partners have read-only access.');
    });

    it('AC-059: a Worker cannot acknowledge a non-operational (WATER_EMERGENCY) alert', async () => {
      const emergency: WaterEmergencyRaised = {
        name: 'WaterEmergencyRaised',
        eventId: randomUUID(),
        occurredAt: new Date(),
        projectId,
        sourceRef: `pond-emergency-${randomUUID()}`,
        message: 'Total DO crash',
      };
      await events.publish(emergency);

      const list = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const emergencyAlert = list.body.find((a: { type: string }) => a.type === 'WATER_EMERGENCY');
      expect(emergencyAlert).toBeDefined();
      expect(emergencyAlert.severity).toBe('CRITICAL');

      await request(app.getHttpServer())
        .post(`/projects/${projectId}/alerts/${emergencyAlert.id}/acknowledge`)
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(403);
    });

    it('a Worker CAN acknowledge an operational (WATER_THRESHOLD) alert; is idempotent on re-ack', async () => {
      const sourceRef = `pond-worker-ack-${randomUUID()}`;
      const breach: WaterThresholdBreached = {
        name: 'WaterThresholdBreached',
        eventId: randomUUID(),
        occurredAt: new Date(),
        projectId,
        sourceRef,
        severity: 'WARNING',
        message: 'Worker-ackable breach',
      };
      await events.publish(breach);

      const list = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const alert = list.body.find((a: { message: string }) =>
        a.message.includes('Worker-ackable breach'),
      );

      const acked = await request(app.getHttpServer())
        .post(`/projects/${projectId}/alerts/${alert.id}/acknowledge`)
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(200);
      expect(acked.body.state).toBe('ACKNOWLEDGED');
      expect(acked.body.acknowledgedAt).not.toBeNull();

      // Edge case 4 / AC-051: re-acknowledging is an idempotent no-op, not an error.
      const reAcked = await request(app.getHttpServer())
        .post(`/projects/${projectId}/alerts/${alert.id}/acknowledge`)
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(200);
      expect(reAcked.body.state).toBe('ACKNOWLEDGED');
    });

    it('acknowledging an unknown alert 404s', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/alerts/${randomUUID()}/acknowledge`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });
  });
});
