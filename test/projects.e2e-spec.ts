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
import { startTestPostgres } from './support/postgres-test-container';

/**
 * Project CRUD e2e (TASK-011, CON-006/007/008/009, AC-030/031/033/036/040) on a real Postgres —
 * end-to-end across MOD-02+MOD-03: project creation bootstraps the real OWNER membership
 * (InitialOwnerMembership), and the Owner-invites-a-Partner step reuses TASK-010's real
 * `POST /projects/{id}/members` endpoint rather than seeding a membership row directly.
 */

function buildProjectsTestAppModule() {
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
    ],
  })
  class ProjectsTestAppModule {}

  return ProjectsTestAppModule;
}

const OWNER_EMAIL = 'projects-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const PARTNER_EMAIL = 'projects-partner@example.com';
const PARTNER_PASSWORD = 'partner correct horse battery staple';

describe('Projects e2e (TASK-011, CON-006…009, AC-030/031/033/036/040)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let accessTokenFor: (email: string, password: string) => Promise<string>;
  let ownerToken: string;

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
      ],
      migrations: [join(__dirname, '..', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const hasher = new Argon2PasswordHasher();
    const users = dataSource.getRepository(UserPersistenceModel);
    await users.save({
      email: OWNER_EMAIL,
      name: 'Projects Owner',
      passwordHash: await hasher.hash(OWNER_PASSWORD),
      status: 'ACTIVE',
    });
    await users.save({
      email: PARTNER_EMAIL,
      name: 'Projects Partner',
      passwordHash: await hasher.hash(PARTNER_PASSWORD),
      status: 'ACTIVE',
    });

    const moduleRef = await Test.createTestingModule({
      imports: [buildProjectsTestAppModule()],
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
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  describe('AC-030: POST /projects', () => {
    it('creates the project and the creator holds an OWNER membership on it', async () => {
      const res = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'North Pond Farm', siteLat: 23.81, siteLng: 90.41, address: 'Dhaka' })
        .expect(201);

      expect(res.body.name).toBe('North Pond Farm');
      expect(res.body.status).toBe('ACTIVE');

      const me = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const own = me.body.memberships.find(
        (m: { projectId: string }) => m.projectId === res.body.id,
      );
      expect(own).toBeDefined();
      expect(own.role).toBe('OWNER');
    });

    it('rejects a malformed create request (missing name)', async () => {
      await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ siteLat: 23.81, siteLng: 90.41 })
        .expect(400);
    });

    it('rejects an unauthenticated create request', async () => {
      await request(app.getHttpServer())
        .post('/projects')
        .send({ name: 'x', siteLat: 0, siteLng: 0 })
        .expect(401);
    });
  });

  describe('AC-040: currency/landUnit', () => {
    it('forces currency to BDT regardless of the request, and defaults landUnit to BIGHA', async () => {
      const res = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Default Units Farm', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);

      expect(res.body.currency).toBe('BDT');
      expect(res.body.landUnit).toBe('BIGHA');
    });

    it('honors an explicit landUnit', async () => {
      const res = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Katha Farm', siteLat: 23.7, siteLng: 90.3, landUnit: 'KATHA' })
        .expect(201);

      expect(res.body.landUnit).toBe('KATHA');
    });

    it('a client-supplied currency field is rejected (not a user choice, ADR-018)', async () => {
      await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Bad Currency Farm', siteLat: 23.7, siteLng: 90.3, currency: 'USD' })
        .expect(400);
    });
  });

  describe('AC-033: GET /projects/{projectId} — scope selection', () => {
    it('the owner can read their own project; an unrelated project 403s (never disclosed)', async () => {
      const created = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Scoped Farm', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);

      const got = await request(app.getHttpServer())
        .get(`/projects/${created.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(got.body.id).toBe(created.body.id);

      const partnerToken = await accessTokenFor(PARTNER_EMAIL, PARTNER_PASSWORD);
      await request(app.getHttpServer())
        .get(`/projects/${created.body.id}`)
        .set('Authorization', `Bearer ${partnerToken}`)
        .expect(403);
    });
  });

  describe('GET /projects — list scoped to caller memberships', () => {
    it("lists only the caller's own projects", async () => {
      const res = await request(app.getHttpServer())
        .get('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      const partnerToken = await accessTokenFor(PARTNER_EMAIL, PARTNER_PASSWORD);
      const partnerRes = await request(app.getHttpServer())
        .get('/projects')
        .set('Authorization', `Bearer ${partnerToken}`)
        .expect(200);
      expect(partnerRes.body.data).toEqual([]);
    });
  });

  describe('AC-031: PATCH /projects/{projectId} — Owner-only (human-confirmed: create is open to any authenticated user)', () => {
    it('a Partner co-owner cannot update the project; the Owner can', async () => {
      const created = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Co-owned Farm', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);

      // Reuses TASK-010's real invite endpoint end-to-end.
      await request(app.getHttpServer())
        .post(`/projects/${created.body.id}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: PARTNER_EMAIL, role: 'PARTNER' })
        .expect(201);

      const partnerToken = await accessTokenFor(PARTNER_EMAIL, PARTNER_PASSWORD);
      const res = await request(app.getHttpServer())
        .patch(`/projects/${created.body.id}`)
        .set('Authorization', `Bearer ${partnerToken}`)
        .send({ name: 'Renamed by Partner' })
        .expect(403);
      expect(res.body.message).toBe('Only an owner can manage projects.');

      const updated = await request(app.getHttpServer())
        .patch(`/projects/${created.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Renamed by Owner' })
        .expect(200);
      expect(updated.body.name).toBe('Renamed by Owner');
    });
  });

  describe('AC-036: closed-project read-only', () => {
    it('a write to a CLOSED project is rejected with PROJECT_CLOSED; reads still succeed; reopen works', async () => {
      const created = await request(app.getHttpServer())
        .post('/projects')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Soon Closed Farm', siteLat: 23.7, siteLng: 90.3 })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/projects/${created.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'CLOSED' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .patch(`/projects/${created.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Should not apply' })
        .expect(409);
      expect(res.body.code).toBe('PROJECT_CLOSED');

      // Reads still succeed on a closed project.
      const got = await request(app.getHttpServer())
        .get(`/projects/${created.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(got.body.status).toBe('CLOSED');
      expect(got.body.name).toBe('Soon Closed Farm'); // the rejected write never applied

      // Reopen (status: ACTIVE alone) is the sanctioned exception.
      const reopened = await request(app.getHttpServer())
        .patch(`/projects/${created.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(reopened.body.status).toBe('ACTIVE');
    });
  });
});
