import { Controller, Get, INestApplication, Module, ValidationPipe } from '@nestjs/common';
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
import { ErrorsModule } from '../src/shared-kernel/errors/errors.module';
import { TenantModule } from '../src/shared-kernel/tenant/tenant.module';
import { Argon2PasswordHasher } from '../src/modules/identity/infrastructure/argon2-password-hasher';
import { PasswordResetTokenPersistenceModel } from '../src/modules/identity/infrastructure/persistence/password-reset-token.persistence-model';
import { ProjectMembershipPersistenceModel } from '../src/modules/identity/infrastructure/persistence/project-membership.persistence-model';
import { RefreshTokenPersistenceModel } from '../src/modules/identity/infrastructure/persistence/refresh-token.persistence-model';
import { UserPersistenceModel } from '../src/modules/identity/infrastructure/persistence/user.persistence-model';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { startTestPostgres } from './support/postgres-test-container';
import { createHash } from 'node:crypto';

/**
 * Full auth e2e (TASK-008) on a real Postgres: login, refresh rotation, replay detection,
 * AC-018's token-claims shape, AC-028's deactivated-user rejection, and — the one that matters
 * most — that `AuthMiddleware` populates `request.user` before `ProjectScopeGuard` runs, proven
 * with the REAL global wiring (not a header stub), not assumed from Nest's module-import order.
 * `MembershipResolverPort` is `IdentityModule`'s real `MembershipResolver` (TASK-010) reading a
 * seeded `project_membership` row — no fake binding (superseded once MOD-02 landed the real one).
 */

const PROJECT_1 = '11111111-1111-4111-8111-111111111111';

/**
 * Built lazily, inside `beforeAll` — after the test container's env vars are assigned to
 * `process.env` — never at file-import time. `NestConfigModule.forRoot()` reads `process.env`
 * synchronously the instant it's called (it's invoked directly in this `@Module`'s `imports`
 * array, evaluated when the decorator runs), so declaring this class at the top level would
 * capture whatever `.env`/`process.env` state existed before the container was even started —
 * silently pointing the app at the developer's local Postgres instead of the disposable
 * container (see the identical note in `test/health.e2e-spec.ts`).
 */
function buildAuthTestAppModule() {
  /** Proves guard ordering: reachable only if AuthMiddleware ran and ProjectScopeGuard approved. */
  @Controller('projects/:projectId/probe')
  class ProbeController {
    @Get()
    ping(): { ok: boolean } {
      return { ok: true };
    }
  }

  @Module({
    imports: [
      NestConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
      PersistenceModule,
      ErrorsModule,
      TenantModule,
      IdentityModule,
    ],
    controllers: [ProbeController],
  })
  class AuthTestAppModule {}

  return AuthTestAppModule;
}

const ACTIVE_EMAIL = 'owner@example.com';
const ACTIVE_PASSWORD = 'correct horse battery staple';
const DEACTIVATED_EMAIL = 'gone@example.com';
const RESET_SUBJECT_EMAIL = 'reset-subject@example.com';
const RESET_SUBJECT_PASSWORD = 'the original password before reset';
let ACTIVE_USER_ID: string;
let DEACTIVATED_USER_ID: string;
let RESET_SUBJECT_USER_ID: string;

describe('Auth e2e (TASK-008, CON-001/CON-002, AC-015…019, AC-028)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;

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

    dataSource = new DataSource({
      ...buildDataSourceOptions(started.dbEnv),
      entities: [
        AuditEntryPersistenceModel,
        UserPersistenceModel,
        RefreshTokenPersistenceModel,
        PasswordResetTokenPersistenceModel,
        ProjectMembershipPersistenceModel,
      ],
      migrations: [join(__dirname, '..', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const hasher = new Argon2PasswordHasher();
    const users = dataSource.getRepository(UserPersistenceModel);

    const active = await users.save({
      email: ACTIVE_EMAIL,
      name: 'Owner',
      passwordHash: await hasher.hash(ACTIVE_PASSWORD),
      status: 'ACTIVE',
    });
    ACTIVE_USER_ID = active.id;

    // Real membership row (TASK-010) — the guard-ordering test below needs ACTIVE_USER to
    // actually be a member of PROJECT_1 for ProjectScopeGuard's real MembershipResolver to admit it.
    await dataSource.getRepository(ProjectMembershipPersistenceModel).save({
      projectId: PROJECT_1,
      userId: active.id,
      role: 'OWNER',
      status: 'ACTIVE',
    });

    const deactivated = await users.save({
      email: DEACTIVATED_EMAIL,
      name: 'Gone',
      passwordHash: await hasher.hash('irrelevant'),
      status: 'DEACTIVATED',
    });
    DEACTIVATED_USER_ID = deactivated.id;

    const resetSubject = await users.save({
      email: RESET_SUBJECT_EMAIL,
      name: 'Reset Subject',
      passwordHash: await hasher.hash(RESET_SUBJECT_PASSWORD),
      status: 'ACTIVE',
    });
    RESET_SUBJECT_USER_ID = resetSubject.id;

    const moduleRef = await Test.createTestingModule({
      imports: [buildAuthTestAppModule()],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    // Mirrors main.ts's bootstrap — a bare createNestApplication() has no ValidationPipe, so
    // a malformed DTO would reach the use-case instead of being rejected 400 at the boundary.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  describe('AC-015/016: POST /auth/login', () => {
    it('valid credentials return an access token and a refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ACTIVE_EMAIL, password: ACTIVE_PASSWORD })
        .expect(200);

      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');
      expect(res.body.expiresIn).toBe(900);
    });

    it('AC-018: the access token carries sub only — no role or project claim', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ACTIVE_EMAIL, password: ACTIVE_PASSWORD })
        .expect(200);

      const payload = JSON.parse(
        Buffer.from(res.body.accessToken.split('.')[1], 'base64url').toString(),
      );
      expect(payload.sub).toBe(ACTIVE_USER_ID);
      expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub']);
    });

    it('AC-016: wrong password and unknown email return the identical error', async () => {
      const wrongPassword = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ACTIVE_EMAIL, password: 'wrong' })
        .expect(401);
      const unknownEmail = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever' })
        .expect(401);

      expect(wrongPassword.body).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
        correlationId: expect.any(String),
      });
      expect(unknownEmail.body.code).toBe(wrongPassword.body.code);
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    });

    it('a deactivated user cannot log in even with the correct password', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: DEACTIVATED_EMAIL, password: 'irrelevant' })
        .expect(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('rejects a malformed request body (missing password)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ACTIVE_EMAIL })
        .expect(400);
    });
  });

  describe('AC-019: POST /auth/refresh rotation and replay detection', () => {
    it('rotation: exchanges a refresh token for a new pair, and the old one stops working', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ACTIVE_EMAIL, password: ACTIVE_PASSWORD })
        .expect(200);
      const firstRefreshToken = login.body.refreshToken;

      const rotated = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: firstRefreshToken })
        .expect(200);
      expect(rotated.body.refreshToken).not.toBe(firstRefreshToken);

      // the now-rotated (revoked) token no longer works
      const reuseAttempt = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: firstRefreshToken })
        .expect(401);
      expect(reuseAttempt.body.code).toBe('TOKEN_REVOKED');
    });

    it('AC-019: replaying a rotated token revokes the whole family — even the new token stops working', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ACTIVE_EMAIL, password: ACTIVE_PASSWORD })
        .expect(200);
      const original = login.body.refreshToken;

      const rotated = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: original })
        .expect(200);
      const rotatedToken = rotated.body.refreshToken;

      // replay the original (already-rotated) token — triggers full-family revocation
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: original })
        .expect(401);

      // the token issued by the (now-suspect) rotation is also dead — forces full re-login
      const afterReplay = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: rotatedToken })
        .expect(401);
      expect(afterReplay.body.code).toBe('TOKEN_REVOKED');
    });

    it('an unknown refresh token is rejected', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'never-issued-token' })
        .expect(401);
    });
  });

  describe('guard ordering and AC-028 — the real global AuthMiddleware + ProjectScopeGuard wiring', () => {
    it('a valid access token lets ProjectScopeGuard resolve membership (request.user was set in time)', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ACTIVE_EMAIL, password: ACTIVE_PASSWORD })
        .expect(200);

      await request(app.getHttpServer())
        .get(`/projects/${PROJECT_1}/probe`)
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200, { ok: true });
    });

    it('no token on a project-scoped route → 403 (ProjectScopeGuard denies, not a 401)', async () => {
      await request(app.getHttpServer()).get(`/projects/${PROJECT_1}/probe`).expect(403);
    });

    it('AC-028: a validly-signed token for a deactivated user is rejected with 401 before the guard runs', async () => {
      // Sign a token directly for the deactivated user (they can't log in to get one via the API).
      const { JwtService } = await import('@nestjs/jwt');
      const jwt = new JwtService({ secret: process.env.JWT_ACCESS_SECRET });
      const forgedForDeactivated = jwt.sign({ sub: DEACTIVATED_USER_ID });

      const res = await request(app.getHttpServer())
        .get(`/projects/${PROJECT_1}/probe`)
        .set('Authorization', `Bearer ${forgedForDeactivated}`)
        .expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
      expect(res.body.message).toBe('Session expired.');
    });

    it('a garbage bearer token is rejected with 401, not silently ignored', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${PROJECT_1}/probe`)
        .set('Authorization', 'Bearer garbage.not.a.jwt')
        .expect(401);
    });
  });

  describe('AC-020: password reset (CON-003/CON-004)', () => {
    it('request always returns 202, whether or not the email belongs to an account (no enumeration)', async () => {
      const known = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: ACTIVE_EMAIL })
        .expect(202);
      const unknown = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'nobody@example.com' })
        .expect(202);

      expect(known.body).toEqual({});
      expect(unknown.body).toEqual({});
    });

    it('AC-020: the request endpoint persists a single-use token row for the account', async () => {
      const resetTokens = dataSource.getRepository(PasswordResetTokenPersistenceModel);
      const before = await resetTokens.count({ where: { userId: ACTIVE_USER_ID } });

      await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: ACTIVE_EMAIL })
        .expect(202);

      const after = await resetTokens.count({ where: { userId: ACTIVE_USER_ID } });
      expect(after).toBe(before + 1);
    });

    it('AC-020: confirming with a valid unexpired token changes the password, and the old password stops working', async () => {
      // A dedicated user, isolated from ACTIVE_USER_ID/ACTIVE_PASSWORD, so this test's password
      // change can't leak into any other test in this file. The raw token is minted directly at
      // the repository layer (same table/lookup RequestResetUseCase writes to) since the real
      // request flow only ever hands the raw secret to the notifier port, never the response body.
      const rawToken = 'e2e-reset-secret';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await dataSource.getRepository(PasswordResetTokenPersistenceModel).save({
        userId: RESET_SUBJECT_USER_ID,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      });

      const newPassword = 'a brand new correct horse battery staple';
      await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ token: rawToken, newPassword })
        .expect(204);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: RESET_SUBJECT_EMAIL, password: RESET_SUBJECT_PASSWORD })
        .expect(401);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: RESET_SUBJECT_EMAIL, password: newPassword })
        .expect(200);
    });

    it('AC-020: a used token is rejected with RESET_TOKEN_INVALID and does not change the password', async () => {
      const rawToken = 'e2e-used-token';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await dataSource.getRepository(PasswordResetTokenPersistenceModel).save({
        userId: ACTIVE_USER_ID,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ token: rawToken, newPassword: 'irrelevant-new-password' })
        .expect(400);
      expect(res.body.code).toBe('RESET_TOKEN_INVALID');

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ACTIVE_EMAIL, password: ACTIVE_PASSWORD })
        .expect(200);
    });

    it('AC-020: an expired token is rejected with RESET_TOKEN_INVALID', async () => {
      const rawToken = 'e2e-expired-token';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await dataSource.getRepository(PasswordResetTokenPersistenceModel).save({
        userId: ACTIVE_USER_ID,
        tokenHash,
        expiresAt: new Date(Date.now() - 1),
        usedAt: null,
      });

      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ token: rawToken, newPassword: 'irrelevant-new-password' })
        .expect(400);
      expect(res.body.code).toBe('RESET_TOKEN_INVALID');
    });

    it('an unknown token is rejected with RESET_TOKEN_INVALID', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ token: 'never-issued-token', newPassword: 'irrelevant-new-password' })
        .expect(400);
      expect(res.body.code).toBe('RESET_TOKEN_INVALID');
    });

    it('rejects a malformed confirm body (short password)', async () => {
      await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ token: 'whatever', newPassword: 'short' })
        .expect(400);
    });
  });
});
