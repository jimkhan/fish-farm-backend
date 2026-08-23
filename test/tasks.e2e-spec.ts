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
import { AlertPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/alert.persistence-model';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';
import { PondPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/pond.persistence-model';
import { PondsModule } from '../src/modules/ponds/ponds.module';
import { SpeciesPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/species.persistence-model';
import { StockingPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/stocking.persistence-model';
import { BatchPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/batch.persistence-model';
import { ProjectPersistenceModel } from '../src/modules/projects/infrastructure/persistence/project.persistence-model';
import { ProjectsModule } from '../src/modules/projects/projects.module';
import { MissedTaskScheduler } from '../src/modules/tasks/application/missed-task.scheduler';
import { TaskLogPersistenceModel } from '../src/modules/tasks/infrastructure/persistence/task-log.persistence-model';
import { TaskPersistenceModel } from '../src/modules/tasks/infrastructure/persistence/task.persistence-model';
import { TasksModule } from '../src/modules/tasks/tasks.module';
import { startTestPostgres, type DisposablePostgres } from './support/postgres-test-container';

/**
 * Tasks e2e (TASK-041, CON-029/030/031, AC-134/135) — full MOD-02+MOD-03+MOD-04+MOD-09 stack on
 * a real Postgres. `MissedTaskScheduler.scan()` is invoked directly (not via its `@Cron` tick —
 * unnecessary in a short-lived test) to prove a real `MissedTask` → real alert pipeline, no
 * synthetic `bus.publish()`.
 */

function buildTasksTestAppModule() {
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
      TasksModule,
    ],
  })
  class TasksTestAppModule {}

  return TasksTestAppModule;
}

const OWNER_EMAIL = 'tasks-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const WORKER_EMAIL = 'tasks-worker@example.com';
const WORKER_PASSWORD = 'worker correct horse battery staple';
const OUTSIDER_EMAIL = 'tasks-outsider@example.com';
const OUTSIDER_PASSWORD = 'outsider correct horse battery staple';

describe('Tasks e2e (TASK-041, CON-029/030/031, AC-134/135)', () => {
  let container: DisposablePostgres;
  let dataSource: DataSource;
  let app: INestApplication;
  let scheduler: MissedTaskScheduler;
  let accessTokenFor: (email: string, password: string) => Promise<string>;
  let ownerToken: string;
  let workerToken: string;
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
        PondPersistenceModel,
        SpeciesPersistenceModel,
        StockingPersistenceModel,
        BatchPersistenceModel,
        AlertPersistenceModel,
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
      imports: [buildTasksTestAppModule()],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    scheduler = moduleRef.get(MissedTaskScheduler);

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
      .send({ name: 'Tasks Farm', siteLat: 23.7, siteLng: 90.3 })
      .expect(201);
    projectId = project.body.id;

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: WORKER_EMAIL, role: 'WORKER' })
      .expect(201);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  describe('CON-029/030: list/create tasks', () => {
    it('AC-134: Owner creates a recurring task, due immediately; Worker/Owner can list it', async () => {
      const created = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Chain drag', recurrenceDays: 10 })
        .expect(201);
      expect(created.body.status).toBe('DUE');
      expect(created.body.recurrenceDays).toBe(10);

      const list = await request(app.getHttpServer())
        .get(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(200);
      expect(list.body.some((t: { id: string }) => t.id === created.body.id)).toBe(true);
    });

    it('a Worker is denied task creation — Owner-only', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ title: 'Liming' })
        .expect(403);
    });

    it('a non-member is denied with no data disclosure', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(403);
    });
  });

  describe('CON-031: complete a task', () => {
    it('AC-134: Worker completes the task with a proof photo; a recurring task rolls its due date forward', async () => {
      const created = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Aeration', recurrenceDays: 5 })
        .expect(201);

      const log = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks/${created.body.id}/logs`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ completedAt: new Date().toISOString(), photoUrl: 'https://example.com/proof.jpg', clientMutationId: 'cmid-1' })
        .expect(201);
      expect(log.body.photoUrl).toBe('https://example.com/proof.jpg');

      const list = await request(app.getHttpServer())
        .get(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const updated = list.body.find((t: { id: string }) => t.id === created.body.id);
      expect(updated.status).toBe('SCHEDULED');
      expect(updated.dueOn > created.body.dueOn).toBe(true);
    });

    it('ADR-010: replaying the same clientMutationId is idempotent', async () => {
      const created = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'One-off checkup' })
        .expect(201);
      const body = { completedAt: new Date().toISOString(), clientMutationId: 'cmid-dup' };

      const first = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks/${created.body.id}/logs`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send(body)
        .expect(201);
      const second = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks/${created.body.id}/logs`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send(body)
        .expect(201);
      expect(second.body.id).toBe(first.body.id);
    });

    it('a Partner is denied completing a task — read-only', async () => {
      const created = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Partner denied' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks/${created.body.id}/logs`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ completedAt: new Date().toISOString(), clientMutationId: 'cmid-outsider' })
        .expect(403);
    });
  });

  describe('AC-135: MissedTaskScheduler', () => {
    it('a due task passing uncompleted transitions to MISSED and raises a real alert via MOD-09', async () => {
      // Create then directly backdate `due_on` in the DB (the API never lets a client set a past
      // due date; the scheduler needs a task that has genuinely gone overdue to prove AC-135).
      const created = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Overdue liming' })
        .expect(201);
      await dataSource
        .getRepository(TaskPersistenceModel)
        .update({ id: created.body.id }, { dueOn: new Date('2020-01-01') });

      await scheduler.scan();

      const list = await request(app.getHttpServer())
        .get(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const updated = list.body.find((t: { id: string }) => t.id === created.body.id);
      expect(updated.status).toBe('MISSED');

      const alerts = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const missedAlert = alerts.body.find(
        (a: { type: string; message: string }) =>
          a.type === 'MISSED_TASK' && a.message.includes('Overdue liming'),
      );
      expect(missedAlert).toBeDefined();
    });
  });
});
