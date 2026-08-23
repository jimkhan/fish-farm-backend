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
import { AlertPersistenceModel } from '../src/modules/notifications/infrastructure/persistence/alert.persistence-model';
import { NotificationsModule } from '../src/modules/notifications/notifications.module';
import { BatchPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/batch.persistence-model';
import { PondPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/pond.persistence-model';
import { SpeciesPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/species.persistence-model';
import { StockingPersistenceModel } from '../src/modules/ponds/infrastructure/persistence/stocking.persistence-model';
import { PondsModule } from '../src/modules/ponds/ponds.module';
import { ProjectPersistenceModel } from '../src/modules/projects/infrastructure/persistence/project.persistence-model';
import { PortfolioModule } from '../src/modules/projects/portfolio.module';
import { ProjectsModule } from '../src/modules/projects/projects.module';
import { FinancialTxnPersistenceModel } from '../src/modules/finance/infrastructure/persistence/financial-txn.persistence-model';
import { FinanceModule } from '../src/modules/finance/finance.module';
import { startTestPostgres, type DisposablePostgres } from './support/postgres-test-container';

/**
 * Portfolio roll-up e2e (TASK-012, CON-035, AC-034/035, R5) — full MOD-02+MOD-03+MOD-04+MOD-09
 * stack on a real Postgres. Proves the cross-module aggregation (biomass from MOD-04, open
 * critical alerts from MOD-09) via the real `PortfolioBiomassPort`/`PortfolioAlertsPort` bindings,
 * not mocks.
 */

function buildPortfolioTestAppModule() {
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
      FinanceModule,
      PortfolioModule,
    ],
  })
  class PortfolioTestAppModule {}

  return PortfolioTestAppModule;
}

const OWNER_EMAIL = 'portfolio-owner@example.com';
const OWNER_PASSWORD = 'owner correct horse battery staple';
const OTHER_OWNER_EMAIL = 'portfolio-other-owner@example.com';
const OTHER_OWNER_PASSWORD = 'other correct horse battery staple';
const PARTNER_EMAIL = 'portfolio-partner@example.com';
const PARTNER_PASSWORD = 'partner correct horse battery staple';

describe('Portfolio e2e (TASK-012, CON-035, AC-034/035, R5)', () => {
  let container: DisposablePostgres;
  let dataSource: DataSource;
  let app: INestApplication;
  let events: DomainEventBus;
  let accessTokenFor: (email: string, password: string) => Promise<string>;
  let ownerToken: string;
  let otherOwnerToken: string;
  let partnerToken: string;
  let goldaSpeciesId: string;

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
        FinancialTxnPersistenceModel,
      ],
      migrations: [join(__dirname, '..', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const hasher = new Argon2PasswordHasher();
    const users = dataSource.getRepository(UserPersistenceModel);
    for (const [email, password] of [
      [OWNER_EMAIL, OWNER_PASSWORD],
      [OTHER_OWNER_EMAIL, OTHER_OWNER_PASSWORD],
      [PARTNER_EMAIL, PARTNER_PASSWORD],
    ]) {
      await users.save({
        email,
        name: email,
        passwordHash: await hasher.hash(password),
        status: 'ACTIVE',
      });
    }

    const golda = await dataSource
      .getRepository(SpeciesPersistenceModel)
      .findOneByOrFail({ name: 'SPF Golda' });
    goldaSpeciesId = golda.id;

    const moduleRef = await Test.createTestingModule({
      imports: [buildPortfolioTestAppModule()],
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
    otherOwnerToken = await accessTokenFor(OTHER_OWNER_EMAIL, OTHER_OWNER_PASSWORD);
    partnerToken = await accessTokenFor(PARTNER_EMAIL, PARTNER_PASSWORD);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  it('AC-034: aggregates biomass + open critical alerts for the Owner\'s own projects (A, B) only, never C', async () => {
    // Project A: owned by OWNER, with a stocking (biomass) and a critical alert.
    const projectA = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Portfolio Farm A', siteLat: 23.7, siteLng: 90.3 })
      .expect(201);
    const pondA = await request(app.getHttpServer())
      .post(`/projects/${projectA.body.id}/ponds`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Pond A', area: 10 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/projects/${projectA.body.id}/ponds/${pondA.body.id}/stockings`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ speciesId: goldaSpeciesId, count: 1000, stockedOn: '2026-01-01' })
      .expect(201);
    const emergencyA: WaterEmergencyRaised = {
      name: 'WaterEmergencyRaised',
      eventId: randomUUID(),
      occurredAt: new Date(),
      projectId: projectA.body.id,
      sourceRef: pondA.body.id,
      message: 'DO crash in Farm A',
    };
    await events.publish(emergencyA);

    // Project B: owned by OWNER, no data — still included, contributing zero.
    const projectB = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Portfolio Farm B', siteLat: 23.7, siteLng: 90.3 })
      .expect(201);

    // Project C: owned by a DIFFERENT user; OWNER is only a Partner on it.
    const projectC = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${otherOwnerToken}`)
      .send({ name: 'Someone Else\'s Farm C', siteLat: 23.7, siteLng: 90.3 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/projects/${projectC.body.id}/members`)
      .set('Authorization', `Bearer ${otherOwnerToken}`)
      .send({ email: OWNER_EMAIL, role: 'PARTNER' })
      .expect(201);

    const portfolio = await request(app.getHttpServer())
      .get('/portfolio/summary')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const projectIds = portfolio.body.projects.map((p: { projectId: string }) => p.projectId);
    expect(projectIds).toEqual(expect.arrayContaining([projectA.body.id, projectB.body.id]));
    expect(projectIds).not.toContain(projectC.body.id);

    expect(portfolio.body.totalBiomassKg).toBe(0); // no sampling yet — biomass is 0, not fabricated
    expect(portfolio.body.openCriticalAlerts).toBe(1);
    const farmA = portfolio.body.projects.find(
      (p: { projectId: string }) => p.projectId === projectA.body.id,
    );
    expect(farmA.openAlerts).toBe(1);
    expect(portfolio.body.netProfit).toEqual({ amountMinor: 0, currency: 'BDT' });
  });

  it('AC-035: a pure Partner (owner of nothing) gets a valid, empty portfolio — never another project\'s data', async () => {
    const res = await request(app.getHttpServer())
      .get('/portfolio/summary')
      .set('Authorization', `Bearer ${partnerToken}`)
      .expect(200);

    expect(res.body.projects).toEqual([]);
    expect(res.body.totalBiomassKg).toBe(0);
    expect(res.body.openCriticalAlerts).toBe(0);
  });

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer()).get('/portfolio/summary').expect(401);
  });
});
