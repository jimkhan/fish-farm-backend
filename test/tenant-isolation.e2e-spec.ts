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
  Param,
  Post,
  Scope,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { join } from 'path';
import { buildDataSourceOptions } from '../src/platform/persistence/data-source.options';
import { ErrorsModule } from '../src/shared-kernel/errors/errors.module';
import {
  MEMBERSHIP_RESOLVER,
  MembershipResolverPort,
} from '../src/shared-kernel/tenant/membership-resolver.port';
import { ProjectScoped } from '../src/shared-kernel/tenant/project-scoped.decorator';
import { ScopedRepository } from '../src/shared-kernel/tenant/scoped-repository';
import { TenantContext } from '../src/shared-kernel/tenant/tenant-context';
import { TenantModule } from '../src/shared-kernel/tenant/tenant.module';
import { FixtureWidgetPersistenceModel } from './fixtures/persistence/entities/fixture-widget.persistence-model';
import { startTestPostgres } from './support/postgres-test-container';

/**
 * The negative isolation test (TASK-004, AC-003/004/005/014, NFR-011) against a real Postgres.
 * Uses the fixture widget as a stand-in project-owned table, a header-based auth stub in place
 * of MOD-02's JWT guard, and a fake global MembershipResolverPort binding — the same global
 * binding shape MOD-02 will provide (TASK-010).
 */

const PROJECT_1 = '11111111-1111-4111-8111-111111111111';
const PROJECT_2 = '22222222-2222-4222-8222-222222222222';
const UNKNOWN_PROJECT = '99999999-9999-4999-8999-999999999999';

const WIDGET_REPO = 'WIDGET_SCOPED_REPO';

let dataSource: DataSource;

const fakeResolver: MembershipResolverPort = {
  async resolve(userId) {
    if (userId === 'user-a') return [{ projectId: PROJECT_1, role: 'OWNER' }];
    if (userId === 'user-b') return [{ projectId: PROJECT_2, role: 'WORKER' }];
    return [];
  },
};

@Global()
@Module({
  providers: [{ provide: MEMBERSHIP_RESOLVER, useValue: fakeResolver }],
  exports: [MEMBERSHIP_RESOLVER],
})
class FakeMembershipModule {}

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
  create(
    @Param('projectId') _projectId: string,
    @Body() body: { name: string; projectId?: string },
  ): Promise<FixtureWidgetPersistenceModel> {
    const widget = new FixtureWidgetPersistenceModel();
    widget.name = body.name;
    if (body.projectId !== undefined) {
      widget.projectId = body.projectId; // hostile client input — must be ignored (AC-014)
    }
    return this.widgets.save(widget);
  }
}

@Controller('unscoped-widgets')
class UnscopedProbeController {
  @Get()
  @ProjectScoped()
  list(): never {
    throw new Error('handler must not run — the guard must reject first (AC-005)');
  }
}

@Module({
  imports: [ErrorsModule, TenantModule, FakeMembershipModule],
  controllers: [WidgetsController, UnscopedProbeController],
  providers: [
    {
      provide: WIDGET_REPO,
      scope: Scope.REQUEST,
      inject: [TenantContext],
      useFactory: (tenant: TenantContext) =>
        new ScopedRepository(dataSource.getRepository(FixtureWidgetPersistenceModel), tenant),
    },
  ],
})
class IsolationTestAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Auth stub standing in for MOD-02's JWT guard: `x-test-user` header → request.user.
    consumer
      .apply((req: { headers: Record<string, unknown>; user?: { id: string } }, _res: unknown, next: () => void) => {
        const userId = req.headers['x-test-user'];
        if (typeof userId === 'string') req.user = { id: userId };
        next();
      })
      .forRoutes('*');
  }
}

describe('Tenant isolation e2e (TASK-004, NFR-011)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;

  beforeAll(async () => {
    const started = await startTestPostgres();
    container = started.container;

    dataSource = new DataSource({
      ...buildDataSourceOptions(started.dbEnv),
      entities: [FixtureWidgetPersistenceModel],
      migrations: [join(__dirname, 'fixtures', 'persistence', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    await dataSource.query(
      `INSERT INTO _fixture_widget (project_id, name) VALUES
         ($1, 'p1-widget-1'), ($1, 'p1-widget-2'), ($2, 'p2-widget-1')`,
      [PROJECT_1, PROJECT_2],
    );

    const moduleRef = await Test.createTestingModule({
      imports: [IsolationTestAppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  it('AC-003: a member reads only their project rows', async () => {
    const res = await request(app.getHttpServer())
      .get(`/projects/${PROJECT_1}/widgets`)
      .set('x-test-user', 'user-a')
      .expect(200);
    const names = res.body.map((w: { name: string }) => w.name).sort();
    expect(names).toEqual(['p1-widget-1', 'p1-widget-2']);
    expect(res.body.every((w: { projectId: string }) => w.projectId === PROJECT_1)).toBe(true);
  });

  it('AC-004 (negative isolation): a non-member gets 403 and no data', async () => {
    const res = await request(app.getHttpServer())
      .get(`/projects/${PROJECT_1}/widgets`)
      .set('x-test-user', 'user-b')
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body.message).toBe('You do not have access to this resource.');
    expect(JSON.stringify(res.body)).not.toContain('widget');
  });

  it('AC-004: the denial is identical for an existing and a non-existent project (anti-enumeration)', async () => {
    const existing = await request(app.getHttpServer())
      .get(`/projects/${PROJECT_1}/widgets`)
      .set('x-test-user', 'user-b')
      .expect(403);
    const nonExistent = await request(app.getHttpServer())
      .get(`/projects/${UNKNOWN_PROJECT}/widgets`)
      .set('x-test-user', 'user-b')
      .expect(403);
    expect(nonExistent.body.code).toBe(existing.body.code);
    expect(nonExistent.body.message).toBe(existing.body.message);
  });

  it('denies an unauthenticated request to a project-scoped route', async () => {
    const res = await request(app.getHttpServer())
      .get(`/projects/${PROJECT_1}/widgets`)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('AC-005: a project-scoped route without scope is rejected with SCOPE_REQUIRED/400 before the handler', async () => {
    const res = await request(app.getHttpServer())
      .get('/unscoped-widgets')
      .set('x-test-user', 'user-a')
      .expect(400);
    expect(res.body.code).toBe('SCOPE_REQUIRED');
    expect(res.body.message).toBe('Project scope is required.');
  });

  it('AC-014 + happy write path: a client-supplied projectId is ignored on write', async () => {
    const res = await request(app.getHttpServer())
      .post(`/projects/${PROJECT_1}/widgets`)
      .set('x-test-user', 'user-a')
      .send({ name: 'planted-widget', projectId: PROJECT_2 })
      .expect(201);
    expect(res.body.projectId).toBe(PROJECT_1);

    const rows = await dataSource.query(
      `SELECT project_id FROM _fixture_widget WHERE name = 'planted-widget'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].project_id).toBe(PROJECT_1);

    // and the member can read it back through the scoped path
    const list = await request(app.getHttpServer())
      .get(`/projects/${PROJECT_1}/widgets`)
      .set('x-test-user', 'user-a')
      .expect(200);
    expect(list.body.map((w: { name: string }) => w.name)).toContain('planted-widget');
  });
});
