import {
  Controller,
  Get,
  INestApplication,
  Module,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { join } from 'path';
import { createHash } from 'node:crypto';
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
import { rolesWithCapability } from '../src/modules/identity/domain/role-capability-matrix';
import { Roles } from '../src/modules/identity/presentation/roles.decorator';
import { RolesGuard } from '../src/modules/identity/presentation/roles.guard';
import { startTestPostgres } from './support/postgres-test-container';

/**
 * Membership/RBAC e2e (TASK-010, CON-005/010/011/012, AC-021…027, AC-029) on a real Postgres —
 * exercises the REAL `MembershipResolver` (no fake, unlike auth.e2e-spec.ts) so
 * `ProjectScopeGuard` is proven out of its fail-closed state by MOD-02's actual binding.
 *
 * Two synthetic probe routes prove the capability matrix generically (AC-025/026) since no real
 * finance/settings endpoint exists yet (MOD-08 not built) — mirrors `auth.e2e-spec.ts`'s
 * `ProbeController` pattern for guard-ordering proofs.
 */

@Controller('projects/:projectId/probe-write')
@UseGuards(RolesGuard)
@Roles(rolesWithCapability('canWrite'), 'Partners have read-only access.')
class WriteProbeController {
  @Post()
  write(): { ok: boolean } {
    return { ok: true };
  }
}

@Controller('projects/:projectId/probe-finance')
@UseGuards(RolesGuard)
@Roles(rolesWithCapability('canAccessFinanceSettings'), 'Workers cannot access finance or settings.')
class FinanceProbeController {
  @Get()
  view(): { ok: boolean } {
    return { ok: true };
  }
}

function buildMembershipTestAppModule() {
  @Module({
    imports: [
      NestConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
      PersistenceModule,
      ErrorsModule,
      TenantModule,
      AuditModule,
      EventsModule,
      IdentityModule,
    ],
    controllers: [WriteProbeController, FinanceProbeController],
  })
  class MembershipTestAppModule {}

  return MembershipTestAppModule;
}

const OWNER_EMAIL = 'p1-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const PARTNER_EMAIL = 'p1-partner@example.com';
const PARTNER_PASSWORD = 'partner correct horse battery staple';
const WORKER_ELSEWHERE_EMAIL = 'worker-elsewhere@example.com';
const WORKER_ELSEWHERE_PASSWORD = 'worker correct horse battery staple';
const CROSS_PROJECT_EMAIL = 'cross-project-owner@example.com';
const CROSS_PROJECT_PASSWORD = 'cross correct horse battery staple';
const PROBE_WORKER_EMAIL = 'probe-worker@example.com';
const PROBE_PARTNER_EMAIL = 'probe-partner@example.com';

const PROJECT_1 = '11111111-1111-4111-8111-111111111111';
const PROJECT_2 = '22222222-2222-4222-8222-222222222222';
const PROJECT_3 = '33333333-3333-4333-8333-333333333333';
const PROJECT_PROBE = '44444444-4444-4444-8444-444444444444';

describe('Membership/RBAC e2e (TASK-010, CON-005/010/011/012, AC-021…027, AC-029)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let accessTokenFor: (email: string, password: string) => Promise<string>;

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
      ],
      migrations: [join(__dirname, '..', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const hasher = new Argon2PasswordHasher();
    const users = dataSource.getRepository(UserPersistenceModel);
    const memberships = dataSource.getRepository(ProjectMembershipPersistenceModel);

    const owner = await users.save({
      email: OWNER_EMAIL,
      name: 'P1 Owner',
      passwordHash: await hasher.hash(OWNER_PASSWORD),
      status: 'ACTIVE',
    });
    const partner = await users.save({
      email: PARTNER_EMAIL,
      name: 'P1 Partner',
      passwordHash: await hasher.hash(PARTNER_PASSWORD),
      status: 'ACTIVE',
    });
    const workerElsewhere = await users.save({
      email: WORKER_ELSEWHERE_EMAIL,
      name: 'Worker Elsewhere',
      passwordHash: await hasher.hash(WORKER_ELSEWHERE_PASSWORD),
      status: 'ACTIVE',
    });
    const crossProjectOwner = await users.save({
      email: CROSS_PROJECT_EMAIL,
      name: 'Cross Project Owner',
      passwordHash: await hasher.hash(CROSS_PROJECT_PASSWORD),
      status: 'ACTIVE',
    });
    const probeWorker = await users.save({
      email: PROBE_WORKER_EMAIL,
      name: 'Probe Worker',
      passwordHash: await hasher.hash('irrelevant-probe-password'),
      status: 'ACTIVE',
    });
    const probePartner = await users.save({
      email: PROBE_PARTNER_EMAIL,
      name: 'Probe Partner',
      passwordHash: await hasher.hash('irrelevant-probe-password'),
      status: 'ACTIVE',
    });

    await memberships.save([
      { projectId: PROJECT_1, userId: owner.id, role: 'OWNER', status: 'ACTIVE' },
      { projectId: PROJECT_1, userId: partner.id, role: 'PARTNER', status: 'ACTIVE' },
      { projectId: PROJECT_2, userId: workerElsewhere.id, role: 'WORKER', status: 'ACTIVE' },
      { projectId: PROJECT_3, userId: crossProjectOwner.id, role: 'OWNER', status: 'ACTIVE' },
      { projectId: PROJECT_PROBE, userId: owner.id, role: 'OWNER', status: 'ACTIVE' },
      { projectId: PROJECT_PROBE, userId: probeWorker.id, role: 'WORKER', status: 'ACTIVE' },
      { projectId: PROJECT_PROBE, userId: probePartner.id, role: 'PARTNER', status: 'ACTIVE' },
    ]);

    const moduleRef = await Test.createTestingModule({
      imports: [buildMembershipTestAppModule()],
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
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  describe('AC-021: GET /me', () => {
    it('lists only the caller\'s own memberships, with role', async () => {
      const token = await accessTokenFor(OWNER_EMAIL, OWNER_PASSWORD);

      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.user.email).toBe(OWNER_EMAIL);
      const projectIds = res.body.memberships.map((m: { projectId: string }) => m.projectId);
      expect(projectIds).toEqual(expect.arrayContaining([PROJECT_1, PROJECT_PROBE]));
      expect(projectIds).not.toContain(PROJECT_2);
      expect(projectIds).not.toContain(PROJECT_3);
    });

    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/me').expect(401);
    });
  });

  describe('AC-022: MembershipResolver / ProjectScopeGuard integration (real binding, no fake)', () => {
    it('a member can reach a project-scoped route for a project they belong to', async () => {
      const token = await accessTokenFor(OWNER_EMAIL, OWNER_PASSWORD);
      const res = await request(app.getHttpServer())
        .get(`/projects/${PROJECT_1}/members`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      // TASK-047: each row is joined with the member's identity so the owner UI shows who they are.
      const ownerRow = res.body.find((m: { role: string }) => m.role === 'OWNER');
      expect(ownerRow).toMatchObject({ email: OWNER_EMAIL, name: 'P1 Owner' });
    });

    it('the same member is denied a project they do not belong to (never leaks existence)', async () => {
      const token = await accessTokenFor(OWNER_EMAIL, OWNER_PASSWORD);
      await request(app.getHttpServer())
        .get(`/projects/${PROJECT_2}/members`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('AC-023: non-Owner cannot manage members', () => {
    it('a Partner cannot list members', async () => {
      const token = await accessTokenFor(PARTNER_EMAIL, PARTNER_PASSWORD);
      const res = await request(app.getHttpServer())
        .get(`/projects/${PROJECT_1}/members`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
      expect(res.body.message).toBe('Only the project owner can manage members.');
    });

    it('a Partner cannot invite a member', async () => {
      const token = await accessTokenFor(PARTNER_EMAIL, PARTNER_PASSWORD);
      await request(app.getHttpServer())
        .post(`/projects/${PROJECT_1}/members`)
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'someone@example.com', role: 'WORKER' })
        .expect(403);
    });
  });

  describe('AC-024/R4: Worker-one-active-project invariant', () => {
    it('assigning WORKER to a user already an active Worker elsewhere returns 409', async () => {
      const token = await accessTokenFor(OWNER_EMAIL, OWNER_PASSWORD);
      const res = await request(app.getHttpServer())
        .post(`/projects/${PROJECT_1}/members`)
        .set('Authorization', `Bearer ${token}`)
        .send({ email: WORKER_ELSEWHERE_EMAIL, role: 'WORKER' })
        .expect(409);
      expect(res.body.code).toBe('WORKER_ALREADY_ASSIGNED');
    });

    it('the same user CAN be assigned a non-Worker role (R4 is Worker-role-specific)', async () => {
      const token = await accessTokenFor(OWNER_EMAIL, OWNER_PASSWORD);
      const res = await request(app.getHttpServer())
        .post(`/projects/${PROJECT_1}/members`)
        .set('Authorization', `Bearer ${token}`)
        .send({ email: WORKER_ELSEWHERE_EMAIL, role: 'PARTNER' })
        .expect(201);
      expect(res.body.role).toBe('PARTNER');
      expect(res.body.projectId).toBe(PROJECT_1);
      expect(res.body.email).toBe(WORKER_ELSEWHERE_EMAIL);
    });
  });

  describe('R8: inviting an unknown email creates a pending account (self-onboards via TASK-009 reset)', () => {
    const PENDING_EMAIL = 'pending-invitee@example.com';

    it('the invite succeeds and the pending account cannot log in yet', async () => {
      const ownerToken = await accessTokenFor(OWNER_EMAIL, OWNER_PASSWORD);
      const res = await request(app.getHttpServer())
        .post(`/projects/${PROJECT_1}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: PENDING_EMAIL, role: 'WORKER' })
        .expect(201);
      expect(res.body.role).toBe('WORKER');

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: PENDING_EMAIL, password: 'anything-they-might-guess' })
        .expect(401);
    });

    it('the pending account can self-onboard via password reset and then log in', async () => {
      const resetTokens = dataSource.getRepository(PasswordResetTokenPersistenceModel);
      const pendingUser = await dataSource
        .getRepository(UserPersistenceModel)
        .findOneOrFail({ where: { email: PENDING_EMAIL } });

      const rawToken = 'e2e-pending-onboard-token';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await resetTokens.save({
        userId: pendingUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      });

      const newPassword = 'the pending users own chosen password';
      await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ token: rawToken, newPassword })
        .expect(204);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: PENDING_EMAIL, password: newPassword })
        .expect(200);
    });
  });

  describe('AC-029: inviting an existing cross-project user exposes neither party to the other', () => {
    it('the invited user gains a membership only in the target project; the inviter gains no visibility into the invitee\'s other project', async () => {
      const ownerToken = await accessTokenFor(OWNER_EMAIL, OWNER_PASSWORD);
      await request(app.getHttpServer())
        .post(`/projects/${PROJECT_1}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: CROSS_PROJECT_EMAIL, role: 'PARTNER' })
        .expect(201);

      // The invitee now sees both P1 (new) and P3 (their own prior project) — expected, it's their own view.
      const inviteeToken = await accessTokenFor(CROSS_PROJECT_EMAIL, CROSS_PROJECT_PASSWORD);
      const me = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${inviteeToken}`)
        .expect(200);
      const projectIds = me.body.memberships.map((m: { projectId: string }) => m.projectId);
      expect(projectIds).toEqual(expect.arrayContaining([PROJECT_1, PROJECT_3]));

      // P1's owner gains no visibility into P3, despite now sharing a member with it.
      await request(app.getHttpServer())
        .get(`/projects/${PROJECT_3}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);
    });
  });

  describe('AC-027/R7: last-Owner invariant', () => {
    it('removing an Owner when another active Owner remains succeeds', async () => {
      const ownerToken = await accessTokenFor(OWNER_EMAIL, OWNER_PASSWORD);
      const secondOwnerEmail = 'second-owner@example.com';

      const invite = await request(app.getHttpServer())
        .post(`/projects/${PROJECT_1}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: secondOwnerEmail, role: 'OWNER' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/projects/${PROJECT_1}/members/${invite.body.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);
    });

    it('removing the sole remaining active Owner is rejected with LAST_OWNER', async () => {
      const ownerToken = await accessTokenFor(OWNER_EMAIL, OWNER_PASSWORD);

      const members = await request(app.getHttpServer())
        .get(`/projects/${PROJECT_1}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const ownerMembership = members.body.find(
        (m: { role: string; userId: string }) => m.role === 'OWNER',
      );

      const res = await request(app.getHttpServer())
        .delete(`/projects/${PROJECT_1}/members/${ownerMembership.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(409);
      expect(res.body.code).toBe('LAST_OWNER');
    });
  });

  describe('AC-025/AC-026: capability matrix probes', () => {
    it('AC-025: OWNER and WORKER can write; PARTNER is denied (read-only)', async () => {
      const ownerToken = await accessTokenFor(OWNER_EMAIL, OWNER_PASSWORD);
      const workerToken = await accessTokenFor(PROBE_WORKER_EMAIL, 'irrelevant-probe-password');
      const partnerToken = await accessTokenFor(PROBE_PARTNER_EMAIL, 'irrelevant-probe-password');

      await request(app.getHttpServer())
        .post(`/projects/${PROJECT_PROBE}/probe-write`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/projects/${PROJECT_PROBE}/probe-write`)
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/projects/${PROJECT_PROBE}/probe-write`)
        .set('Authorization', `Bearer ${partnerToken}`)
        .expect(403);
      expect(res.body.message).toBe('Partners have read-only access.');
    });

    it('AC-026: OWNER and PARTNER can access finance/settings; WORKER is denied', async () => {
      const ownerToken = await accessTokenFor(OWNER_EMAIL, OWNER_PASSWORD);
      const workerToken = await accessTokenFor(PROBE_WORKER_EMAIL, 'irrelevant-probe-password');
      const partnerToken = await accessTokenFor(PROBE_PARTNER_EMAIL, 'irrelevant-probe-password');

      await request(app.getHttpServer())
        .get(`/projects/${PROJECT_PROBE}/probe-finance`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/projects/${PROJECT_PROBE}/probe-finance`)
        .set('Authorization', `Bearer ${partnerToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/projects/${PROJECT_PROBE}/probe-finance`)
        .set('Authorization', `Bearer ${workerToken}`)
        .expect(403);
      expect(res.body.message).toBe('Workers cannot access finance or settings.');
    });
  });
});
