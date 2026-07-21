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
import { ProjectPersistenceModel } from '../src/modules/projects/infrastructure/persistence/project.persistence-model';
import { ProjectsModule } from '../src/modules/projects/projects.module';
import { CameraPersistenceModel } from '../src/modules/monitoring/infrastructure/persistence/camera.persistence-model';
import { WeatherSnapshotPersistenceModel } from '../src/modules/monitoring/infrastructure/persistence/weather-snapshot.persistence-model';
import { MonitoringModule } from '../src/modules/monitoring/monitoring.module';
import { WEATHER_STALENESS_THRESHOLD_MS } from '../src/modules/monitoring/domain/staleness.service';
import { startTestPostgres } from './support/postgres-test-container';

/**
 * Camera + weather e2e (TASK-035/036, CON-036/037, AC-118/119/120/121/124) — full
 * MOD-02+MOD-03+MOD-10 stack on a real Postgres. Both endpoints are read-only over rows seeded
 * directly via the DataSource — camera because no create endpoint exists at all (human-confirmed
 * scope, TASK-035), weather because `RefreshWeatherScheduler`'s real OpenWeather call is
 * appropriately covered at the adapter/scheduler unit-test level, not re-proven here against a
 * live third-party network dependency.
 */

function buildMonitoringTestAppModule() {
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
      MonitoringModule,
    ],
  })
  class MonitoringTestAppModule {}

  return MonitoringTestAppModule;
}

const OWNER_EMAIL = 'monitoring-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const WORKER_EMAIL = 'monitoring-worker@example.com';
const WORKER_PASSWORD = 'worker correct horse battery staple';
const OUTSIDER_EMAIL = 'monitoring-outsider@example.com';
const OUTSIDER_PASSWORD = 'outsider correct horse battery staple';

describe('Camera + Weather e2e (TASK-035/036, CON-036/037, AC-118/119/120/121/124)', () => {
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
        CameraPersistenceModel,
        WeatherSnapshotPersistenceModel,
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
      await users.save({ email, name: email, passwordHash: await hasher.hash(password), status: 'ACTIVE' });
    }

    const moduleRef = await Test.createTestingModule({
      imports: [buildMonitoringTestAppModule()],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    accessTokenFor = async (email, password) => {
      const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
      return res.body.accessToken;
    };
    ownerToken = await accessTokenFor(OWNER_EMAIL, OWNER_PASSWORD);
    workerToken = await accessTokenFor(WORKER_EMAIL, WORKER_PASSWORD);
    outsiderToken = await accessTokenFor(OUTSIDER_EMAIL, OUTSIDER_PASSWORD);

    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Camera Farm', siteLat: 23.7, siteLng: 90.3 })
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

  it('AC-118: returns the client-safe stream URL, never the raw rtspUrl/credentials', async () => {
    await dataSource.getRepository(CameraPersistenceModel).save({
      projectId,
      rtspUrl: 'rtsp://admin:s3cret@192.168.1.50:554/stream1',
      streamUrl: 'https://media.example.com/hls/index.m3u8',
      protocol: 'HLS',
      online: true,
    });

    const res = await request(app.getHttpServer())
      .get(`/projects/${projectId}/camera`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body).toEqual({
      projectId,
      streamUrl: 'https://media.example.com/hls/index.m3u8',
      protocol: 'HLS',
      online: true,
    });
    expect(JSON.stringify(res.body)).not.toContain('rtsp://');
    expect(JSON.stringify(res.body)).not.toContain('s3cret');
  });

  it('camera view is Worker-readable too (not settings-gated)', async () => {
    await request(app.getHttpServer())
      .get(`/projects/${projectId}/camera`)
      .set('Authorization', `Bearer ${workerToken}`)
      .expect(200);
  });

  it('a project with no camera configured returns 404, not a crash', async () => {
    const bare = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Cameraless Farm', siteLat: 23.7, siteLng: 90.3 })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/projects/${bare.body.id}/camera`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });

  it('AC-124: a non-member is denied with no data disclosure', async () => {
    await request(app.getHttpServer())
      .get(`/projects/${projectId}/camera`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });

  it('rejects an unauthenticated request (403 — ProjectScopeGuard treats a missing header the same as a non-member, no disclosure)', async () => {
    await request(app.getHttpServer()).get(`/projects/${projectId}/camera`).expect(403);
  });

  describe('CON-037: GET /projects/{projectId}/weather (TASK-036, AC-120/121/124)', () => {
    it('AC-120: returns the cached snapshot keyed to the project, highlighting heavy rain/extreme heat', async () => {
      await dataSource.getRepository(WeatherSnapshotPersistenceModel).save({
        projectId,
        tempC: 38,
        condition: 'Rain',
        heavyRain: true,
        extremeHeat: true,
        fetchedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/weather`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        projectId,
        tempC: 38,
        condition: 'Rain',
        heavyRain: true,
        extremeHeat: true,
        stale: false,
      });
    });

    it('AC-121: a cache older than the staleness threshold is served with stale=true, not refetched live', async () => {
      const otherProject = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Stale Weather Farm', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);
      const oldFetchedAt = new Date(Date.now() - (WEATHER_STALENESS_THRESHOLD_MS + 60_000));
      await dataSource.getRepository(WeatherSnapshotPersistenceModel).save({
        projectId: otherProject.body.id,
        tempC: 30,
        condition: 'Clear',
        heavyRain: false,
        extremeHeat: false,
        fetchedAt: oldFetchedAt,
      });

      const res = await request(app.getHttpServer())
        .get(`/projects/${otherProject.body.id}/weather`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.stale).toBe(true);
      expect(res.body.tempC).toBe(30); // last-known value, still served (R3 edge case 2)
    });

    it('weather view is Worker-readable too (not settings-gated)', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/weather`)
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(200);
    });

    it('a project with no weather ever fetched returns 404, not a crash', async () => {
      const bare = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Weatherless Farm', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/projects/${bare.body.id}/weather`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('AC-124: a non-member is denied with no data disclosure', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/weather`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(403);
    });
  });
});
