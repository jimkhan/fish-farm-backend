import {
  Body,
  Controller,
  Get,
  Global,
  INestApplication,
  Inject,
  MiddlewareConsumer,
  Module,
  NestModule,
  Post,
  Scope,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { join } from 'path';
import { buildDataSourceOptions } from '../src/platform/persistence/data-source.options';
import { TransactionContext } from '../src/platform/persistence/transaction-context';
import { AuditEntryPersistenceModel } from '../src/shared-kernel/audit/audit-entry.persistence-model';
import { AuditInterceptor } from '../src/shared-kernel/audit/audit.interceptor';
import { AuditWriter } from '../src/shared-kernel/audit/audit.writer';
import { ErrorsModule } from '../src/shared-kernel/errors/errors.module';
import {
  MEMBERSHIP_RESOLVER,
  MembershipResolverPort,
} from '../src/shared-kernel/tenant/membership-resolver.port';
import { ScopedRepository } from '../src/shared-kernel/tenant/scoped-repository';
import { TenantContext } from '../src/shared-kernel/tenant/tenant-context';
import { TenantModule } from '../src/shared-kernel/tenant/tenant.module';
import { FixtureWidgetPersistenceModel } from './fixtures/persistence/entities/fixture-widget.persistence-model';
import { startTestPostgres } from './support/postgres-test-container';

/**
 * Integration test for the in-transaction audit trail (TASK-005, AC-006/007, NFR-012) on a
 * real Postgres: a scoped domain write and its audit entry commit together — and roll back
 * together when the audit write fails.
 */

const PROJECT_1 = '11111111-1111-4111-8111-111111111111';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

let dataSource: DataSource;

const fakeResolver: MembershipResolverPort = {
  async resolve(userId) {
    return userId === USER_A ? [{ projectId: PROJECT_1, role: 'OWNER' }] : [];
  },
};

@Global()
@Module({
  providers: [{ provide: MEMBERSHIP_RESOLVER, useValue: fakeResolver }],
  exports: [MEMBERSHIP_RESOLVER],
})
class FakeMembershipModule {}

const WIDGET_REPO = 'WIDGET_SCOPED_REPO';

@Controller('projects/:projectId/widgets')
class WidgetsController {
  constructor(
    @Inject(WIDGET_REPO)
    private readonly widgets: ScopedRepository<FixtureWidgetPersistenceModel>,
  ) {}

  @Get()
  list(): Promise<FixtureWidgetPersistenceModel[]> {
    return this.widgets.find();
  }

  @Post()
  create(@Body() body: { name: string }): Promise<FixtureWidgetPersistenceModel> {
    const widget = new FixtureWidgetPersistenceModel();
    widget.name = body.name;
    return this.widgets.save(widget);
  }
}

@Module({
  imports: [ErrorsModule, TenantModule, FakeMembershipModule],
  controllers: [WidgetsController],
  providers: [
    TransactionContext,
    AuditWriter,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: DataSource, useValue: undefined }, // replaced in beforeAll via overrideProvider
    {
      provide: WIDGET_REPO,
      scope: Scope.REQUEST,
      inject: [TenantContext, TransactionContext],
      useFactory: (tenant: TenantContext, transactions: TransactionContext) =>
        new ScopedRepository(
          dataSource.getRepository(FixtureWidgetPersistenceModel),
          tenant,
          transactions,
        ),
    },
  ],
})
class AuditTestAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        (
          req: { headers: Record<string, unknown>; user?: { id: string } },
          _res: unknown,
          next: () => void,
        ) => {
          const userId = req.headers['x-test-user'];
          if (typeof userId === 'string') req.user = { id: userId };
          next();
        },
      )
      .forRoutes('*');
  }
}

function testModule(): TestingModuleBuilder {
  return Test.createTestingModule({ imports: [AuditTestAppModule] })
    .overrideProvider(DataSource)
    .useValue(dataSource);
}

describe('Audit trail e2e (TASK-005, NFR-012)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;

  beforeAll(async () => {
    const started = await startTestPostgres();
    container = started.container;

    dataSource = new DataSource({
      ...buildDataSourceOptions(started.dbEnv),
      entities: [FixtureWidgetPersistenceModel, AuditEntryPersistenceModel],
      migrations: [
        join(__dirname, 'fixtures', 'persistence', 'migrations', '*.ts'),
        join(__dirname, '..', 'migrations', '*.ts'),
      ],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const moduleRef = await testModule().compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  it('AC-006: a successful state-changing request commits the domain write and a matching audit entry together', async () => {
    const res = await request(app.getHttpServer())
      .post(`/projects/${PROJECT_1}/widgets`)
      .set('x-test-user', USER_A)
      .send({ name: 'audited-widget' })
      .expect(201);

    const audits = await dataSource.query(
      `SELECT * FROM audit_entry WHERE entity_id = $1`,
      [res.body.id],
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      project_id: PROJECT_1,
      actor_user_id: USER_A,
      action: 'POST /projects/:projectId/widgets',
      entity_type: 'Widgets',
    });
    expect(audits[0].occurred_at).toBeInstanceOf(Date);
  });

  it('does not audit reads', async () => {
    const before = await dataSource.query(`SELECT count(*)::int AS n FROM audit_entry`);
    await request(app.getHttpServer())
      .get(`/projects/${PROJECT_1}/widgets`)
      .set('x-test-user', USER_A)
      .expect(200);
    const after = await dataSource.query(`SELECT count(*)::int AS n FROM audit_entry`);
    expect(after[0].n).toBe(before[0].n);
  });

  it('AC-007: when the audit write fails, the domain write rolls back too — no orphan state', async () => {
    const failingModule = await testModule()
      .overrideProvider(AuditWriter)
      .useValue({
        write: async () => {
          throw new Error('audit store unavailable');
        },
      })
      .compile();
    const failingApp = failingModule.createNestApplication({ logger: false });
    await failingApp.init();

    const res = await request(failingApp.getHttpServer())
      .post(`/projects/${PROJECT_1}/widgets`)
      .set('x-test-user', USER_A)
      .send({ name: 'must-roll-back' })
      .expect(500);
    expect(res.body.code).toBe('INTERNAL');

    const widgets = await dataSource.query(
      `SELECT * FROM _fixture_widget WHERE name = 'must-roll-back'`,
    );
    expect(widgets).toHaveLength(0); // the committed handler write was rolled back

    await failingApp.close();
  });
});
