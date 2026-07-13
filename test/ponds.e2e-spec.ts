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
import { SpeciesPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/species.persistence-model';
import { PondsModule } from '../src/modules/ponds/ponds.module';
import { ProjectPersistenceModel } from '../src/modules/projects/infrastructure/persistence/project.persistence-model';
import { ProjectsModule } from '../src/modules/projects/projects.module';
import { startTestPostgres } from './support/postgres-test-container';

/**
 * Ponds/species e2e (TASK-018, CON-013/014/048, AC-060/061/069, AC-032/068) — full MOD-02+
 * MOD-03+MOD-04 stack on a real Postgres, proving `ProvisionFirstPondPort`'s real binding (no
 * fake) atomically creates a project's first pond.
 */

function buildPondsTestAppModule() {
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
  class PondsTestAppModule {}

  return PondsTestAppModule;
}

const OWNER_EMAIL = 'ponds-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const OUTSIDER_EMAIL = 'ponds-outsider@example.com';
const OUTSIDER_PASSWORD = 'outsider correct horse battery staple';

describe('Ponds/Species e2e (TASK-018, CON-013/014/048, AC-060/061/069/032/068)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let accessTokenFor: (email: string, password: string) => Promise<string>;
  let ownerToken: string;
  let outsiderToken: string;

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
      ],
      migrations: [join(__dirname, '..', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const hasher = new Argon2PasswordHasher();
    const users = dataSource.getRepository(UserPersistenceModel);
    await users.save({
      email: OWNER_EMAIL,
      name: 'Ponds Owner',
      passwordHash: await hasher.hash(OWNER_PASSWORD),
      status: 'ACTIVE',
    });
    await users.save({
      email: OUTSIDER_EMAIL,
      name: 'Ponds Outsider',
      passwordHash: await hasher.hash(OUTSIDER_PASSWORD),
      status: 'ACTIVE',
    });

    const moduleRef = await Test.createTestingModule({
      imports: [buildPondsTestAppModule()],
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
    outsiderToken = await accessTokenFor(OUTSIDER_EMAIL, OUTSIDER_PASSWORD);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  describe('CON-048: GET /species', () => {
    it('lists the seeded reference species', async () => {
      const res = await request(app.getHttpServer()).get('/species').expect(200);
      const names = res.body.map((s: { name: string }) => s.name);
      expect(names).toEqual(expect.arrayContaining(['SPF Golda', 'Parse', 'Carp', 'Grass Carp']));
    });
  });

  describe('AC-060/061: POST /projects/{projectId}/ponds', () => {
    it("AC-060: an authorized member creates a pond, persisted scoped to their project", async () => {
      const project = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Pond Test Farm', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);

      const pond = await request(app.getHttpServer())
        .post(`/projects/${project.body.id}/ponds`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'North Pond', area: 12.5, depthM: 1.5 })
        .expect(201);

      expect(pond.body.projectId).toBe(project.body.id);
      expect(pond.body.name).toBe('North Pond');

      const list = await request(app.getHttpServer())
        .get(`/projects/${project.body.id}/ponds`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(list.body.map((p: { id: string }) => p.id)).toContain(pond.body.id);
    });

    it('AC-061: a non-member is denied creating a pond, with no data disclosure', async () => {
      const project = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Private Farm', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/projects/${project.body.id}/ponds`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ name: 'Sneaky Pond', area: 5 })
        .expect(403);
    });

    it('rejects a malformed pond (non-positive area)', async () => {
      const project = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Validation Farm', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/projects/${project.body.id}/ponds`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Bad Pond', area: -1 })
        .expect(400);
    });
  });

  describe('AC-069: pond creation on a CLOSED project', () => {
    it('returns PROJECT_CLOSED/409', async () => {
      const project = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Soon Closed Pond Farm', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/projects/${project.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'CLOSED' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/projects/${project.body.id}/ponds`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Too Late Pond', area: 5 })
        .expect(409);
      expect(res.body.code).toBe('PROJECT_CLOSED');
    });
  });

  describe('AC-032/068: inline first-pond, real ProvisionFirstPondPort binding', () => {
    it('creates the project and its first pond atomically', async () => {
      const res = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Inline Pond Farm',
          siteLat: 23.7,
          siteLng: 90.3,
          firstPond: { name: 'Day-One Pond', area: 8, depthM: 1.2, notes: 'Near the gate' },
        })
        .expect(201);

      const ponds = await request(app.getHttpServer())
        .get(`/projects/${res.body.id}/ponds`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(ponds.body).toHaveLength(1);
      expect(ponds.body[0]).toMatchObject({
        projectId: res.body.id,
        name: 'Day-One Pond',
        area: 8,
        depthM: 1.2,
        notes: 'Near the gate',
      });
    });

    it('an invalid firstPond is rejected at the boundary and no project is created (atomic, AC-032)', async () => {
      const before = await request(app.getHttpServer())
        .get('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const beforeCount = before.body.data.length;

      await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Should Not Exist Farm',
          siteLat: 23.7,
          siteLng: 90.3,
          firstPond: { name: 'Bad Pond', area: -1 },
        })
        .expect(400);

      const after = await request(app.getHttpServer())
        .get('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(after.body.data.length).toBe(beforeCount);
      const names = after.body.data.map((p: { name: string }) => p.name);
      expect(names).not.toContain('Should Not Exist Farm');
    });
  });
});
