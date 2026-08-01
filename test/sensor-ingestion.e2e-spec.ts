import { createHash, randomBytes } from 'node:crypto';
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
import { PondPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/pond.persistence-model';
import { PondsModule } from '../src/modules/ponds/ponds.module';
import { SpeciesPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/species.persistence-model';
import { StockingPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/stocking.persistence-model';
import { BatchPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/batch.persistence-model';
import { ProjectPersistenceModel } from '../src/modules/projects/infrastructure/persistence/project.persistence-model';
import { ProjectsModule } from '../src/modules/projects/projects.module';
import { AlertPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/alert.persistence-model';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';
import { DevicePersistenceModel } from '../src/modules/water/infrastructure/persistence/device.persistence-model';
import { WaterReadingPersistenceModel } from '../src/modules/water/infrastructure/persistence/water-reading.persistence-model';
import { WaterThresholdPersistenceModel } from '../src/modules/water/infrastructure/persistence/water-threshold.persistence-model';
import { PondActionPersistenceModel } from '../src/modules/water/infrastructure/persistence/pond-action.persistence-model';
import { WaterModule } from '../src/modules/water/water.module';
import { startTestPostgres } from './support/postgres-test-container';

/**
 * Secured sensor ingestion e2e (TASK-027, CON-044, AC-089, R6) — device-key auth + wrong-project
 * rejection, the required security deliverables. Devices are seeded directly (registration is the
 * separate reserved CON-056), mirroring how camera rows are provisioned out-of-band.
 */
function buildSensorTestAppModule() {
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
      WaterModule,
    ],
  })
  class SensorTestAppModule {}
  return SensorTestAppModule;
}

const OWNER_EMAIL = 'sensor-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

describe('Sensor ingestion e2e (TASK-027, CON-044, AC-089)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let ownerToken: string;

  let projectAId: string;
  let pondAId: string;
  let deviceAId: string;
  const deviceAKey = randomBytes(32).toString('hex');

  let projectBId: string;
  let pondBId: string;
  let deviceBId: string;
  const deviceBKey = randomBytes(32).toString('hex');

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
        WaterReadingPersistenceModel,
        WaterThresholdPersistenceModel,
        PondActionPersistenceModel,
        DevicePersistenceModel,
      ],
      migrations: [join(__dirname, '..', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const hasher = new Argon2PasswordHasher();
    await dataSource
      .getRepository(UserPersistenceModel)
      .save({ email: OWNER_EMAIL, name: OWNER_EMAIL, passwordHash: await hasher.hash(OWNER_PASSWORD), status: 'ACTIVE' });

    const moduleRef = await Test.createTestingModule({
      imports: [buildSensorTestAppModule()],
    }).compile();
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

    const projectA = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Sensor Farm A', siteLat: 23.7, siteLng: 90.3 })
      .expect(201);
    projectAId = projectA.body.id;
    const pondA = await request(app.getHttpServer())
      .post(`/projects/${projectAId}/ponds`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Pond A', area: 10 })
      .expect(201);
    pondAId = pondA.body.id;

    const projectB = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Sensor Farm B', siteLat: 23.8, siteLng: 90.4 })
      .expect(201);
    projectBId = projectB.body.id;
    const pondB = await request(app.getHttpServer())
      .post(`/projects/${projectBId}/ponds`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Pond B', area: 8 })
      .expect(201);
    pondBId = pondB.body.id;

    // Devices seeded out-of-band (no registration endpoint — CON-056 is a separate task).
    const devices = dataSource.getRepository(DevicePersistenceModel);
    const savedA = await devices.save({
      projectId: projectAId,
      pondId: pondAId,
      deviceKeyHash: hashKey(deviceAKey),
      label: 'Pond A DO sensor',
    });
    deviceAId = savedA.id;
    const savedB = await devices.save({
      projectId: projectBId,
      pondId: pondBId,
      deviceKeyHash: hashKey(deviceBKey),
      label: 'Pond B DO sensor',
    });
    deviceBId = savedB.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  it('AC-089: a valid device key stores a source=SENSOR reading for the device project only', async () => {
    await request(app.getHttpServer())
      .post(`/devices/${deviceAId}/readings`)
      .set('X-Device-Key', deviceAKey)
      .send({ parameter: 'DO', value: 6.4, readAt: '2026-07-01T05:00:00.000Z' })
      .expect(202);

    // The owner of project A sees it, stored as SENSOR with the device id, in pond A.
    const list = await request(app.getHttpServer())
      .get(`/projects/${projectAId}/ponds/${pondAId}/water-readings?parameter=DO`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const sensorReading = list.body.find((r: { source: string }) => r.source === 'SENSOR');
    expect(sensorReading).toBeDefined();
    expect(sensorReading.deviceId).toBe(deviceAId);
    expect(sensorReading.value).toBe(6.4);
  });

  it('an invalid (unknown) device key returns 401', async () => {
    await request(app.getHttpServer())
      .post(`/devices/${deviceAId}/readings`)
      .set('X-Device-Key', 'f'.repeat(64))
      .send({ parameter: 'DO', value: 6.0, readAt: '2026-07-01T06:00:00.000Z' })
      .expect(401);
  });

  it('a missing device key returns 401', async () => {
    await request(app.getHttpServer())
      .post(`/devices/${deviceAId}/readings`)
      .send({ parameter: 'DO', value: 6.0, readAt: '2026-07-01T06:00:00.000Z' })
      .expect(401);
  });

  it('an unknown deviceId returns 401', async () => {
    await request(app.getHttpServer())
      .post(`/devices/${randomBytes(16).toString('hex')}/readings`)
      .set('X-Device-Key', deviceAKey)
      .expect(401);
  });

  it("AC-089 wrong-project rejection: device A's key cannot post against device B's URL", async () => {
    await request(app.getHttpServer())
      .post(`/devices/${deviceBId}/readings`)
      .set('X-Device-Key', deviceAKey)
      .send({ parameter: 'DO', value: 6.0, readAt: '2026-07-01T07:00:00.000Z' })
      .expect(401);

    // Positive isolation: device B, with its OWN key, writes only to project B — and that reading
    // never appears in project A (each device is bound to exactly one project, R6).
    await request(app.getHttpServer())
      .post(`/devices/${deviceBId}/readings`)
      .set('X-Device-Key', deviceBKey)
      .send({ parameter: 'DO', value: 5.5, readAt: '2026-07-01T07:30:00.000Z' })
      .expect(202);

    const listB = await request(app.getHttpServer())
      .get(`/projects/${projectBId}/ponds/${pondBId}/water-readings?parameter=DO`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(listB.body.some((r: { deviceId: string | null }) => r.deviceId === deviceBId)).toBe(true);

    const listA = await request(app.getHttpServer())
      .get(`/projects/${projectAId}/ponds/${pondAId}/water-readings?parameter=DO`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(listA.body.some((r: { deviceId: string | null }) => r.deviceId === deviceBId)).toBe(false);
  });

  it('rejects a malformed payload (extra/unknown field) with 400', async () => {
    await request(app.getHttpServer())
      .post(`/devices/${deviceAId}/readings`)
      .set('X-Device-Key', deviceAKey)
      .send({ parameter: 'DO', value: 6.0, readAt: '2026-07-01T08:00:00.000Z', pondId: pondBId })
      .expect(400);
  });
});
