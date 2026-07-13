import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
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
import { InventoryItemPersistenceModel } from '../src/modules/inventory/infrastructure/persistence/inventory-item.persistence-model';
import { InventoryTxnPersistenceModel } from '../src/modules/inventory/infrastructure/persistence/inventory-txn.persistence-model';
import { InventoryModule } from '../src/modules/inventory/inventory.module';
import { ProjectPersistenceModel } from '../src/modules/projects/infrastructure/persistence/project.persistence-model';
import { ProjectsModule } from '../src/modules/projects/projects.module';
import { startTestPostgres } from './support/postgres-test-container';

/**
 * Inventory e2e (TASK-020, CON-022/023/024, AC-078/079/080/082) — full MOD-02+MOD-03+MOD-09
 * stack on a real Postgres. A real low-stock crossing publishes a real `LowStock` event, consumed
 * by MOD-09's already-built handler into a real, queryable alert — no synthetic bus.publish().
 */

function buildInventoryTestAppModule() {
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
  class InventoryTestAppModule {}

  return InventoryTestAppModule;
}

const OWNER_EMAIL = 'inventory-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const WORKER_EMAIL = 'inventory-worker@example.com';
const WORKER_PASSWORD = 'worker correct horse battery staple';
const OUTSIDER_EMAIL = 'inventory-outsider@example.com';
const OUTSIDER_PASSWORD = 'outsider correct horse battery staple';

describe('Inventory e2e (TASK-020, CON-022/023/024, AC-078/079/080/082)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
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
        AlertPersistenceModel,
        InventoryItemPersistenceModel,
        InventoryTxnPersistenceModel,
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
      imports: [buildInventoryTestAppModule()],
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
      .send({ name: 'Inventory Farm', siteLat: 23.7, siteLng: 90.3 })
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

  describe('CON-022/023: list/create inventory items', () => {
    it('AC-078: Owner creates an item; Partner/Worker/Owner can all list it', async () => {
      const created = await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Floating Pellets', feedType: 'FLOATING', unit: 'kg', lowStockThreshold: 20 })
        .expect(201);
      expect(created.body.quantity).toBe(0);
      expect(created.body.lowStockThreshold).toBe(20);

      const list = await request(app.getHttpServer())
        .get(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(200);
      expect(list.body.some((i: { id: string }) => i.id === created.body.id)).toBe(true);
    });

    it('CON-023: a Worker is denied item creation — Owner-only', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ name: 'Sinking Pellets', feedType: 'SINKING', unit: 'kg' })
        .expect(403);
    });

    it('AC-078: a non-member is denied with no data disclosure', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(403);
    });
  });

  describe('CON-024/AC-079/082: transactions, low-stock crossing, money', () => {
    it('AC-074-analog/AC-082: a receipt atomically increases quantity and stores cost in minor units', async () => {
      const item = await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Nursery Dust', feedType: 'NURSERY_DUST', unit: 'kg', lowStockThreshold: 10 })
        .expect(201);

      const receipt = await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory/${item.body.id}/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ delta: 100, reason: 'Initial stock receipt', cost: { amountMinor: 500000 } })
        .expect(201);
      expect(receipt.body.cost).toEqual({ amountMinor: 500000, currency: 'BDT' });

      const list = await request(app.getHttpServer())
        .get(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const updated = list.body.find((i: { id: string }) => i.id === item.body.id);
      expect(updated.quantity).toBe(100);
    });

    it('a Worker is denied recording a transaction — Owner-only', async () => {
      const item = await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Worker Denied Item', unit: 'kg' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory/${item.body.id}/transactions`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ delta: 10, reason: 'attempt' })
        .expect(403);
    });

    it('a manual adjustment driving quantity negative is rejected (400)', async () => {
      const item = await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Small Stock Item', unit: 'kg' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory/${item.body.id}/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ delta: 5, reason: 'small receipt' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory/${item.body.id}/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ delta: -10, reason: 'over-deduct' })
        .expect(400);
    });

    it('AC-079: a downward crossing emits a real LowStock, consumed into a real alert (single-fire, R6)', async () => {
      const item = await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Crossing Item', unit: 'kg', lowStockThreshold: 20 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory/${item.body.id}/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ delta: 25, reason: 'receipt' })
        .expect(201);

      // 25 -> 15: crosses the threshold of 20.
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory/${item.body.id}/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ delta: -10, reason: 'deduction' })
        .expect(201);

      // Stays below: 15 -> 10, must NOT re-fire (single alert row expected).
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/inventory/${item.body.id}/transactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ delta: -5, reason: 'deduction' })
        .expect(201);

      const alerts = await request(app.getHttpServer())
        .get(`/projects/${projectId}/alerts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      // AlertResponse doesn't expose sourceRef, so match on the message this handler composes
      // (includes the item's name, unique to this test) to isolate this item's own alert(s).
      const lowStockAlerts = alerts.body.filter(
        (a: { type: string; message: string }) =>
          a.type === 'LOW_STOCK' && a.message.includes('Crossing Item'),
      );
      expect(lowStockAlerts.length).toBe(1);
    });
  });

  describe('R9: closed-project write-guard', () => {
    it('creating an item on a CLOSED project returns PROJECT_CLOSED/409', async () => {
      const project = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Soon Closed Inventory Farm', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/projects/${project.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'CLOSED' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/projects/${project.body.id}/inventory`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Blocked Item', unit: 'kg' })
        .expect(409);
      expect(res.body.code).toBe('PROJECT_CLOSED');
    });
  });
});
