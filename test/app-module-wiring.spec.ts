import { getDataSourceToken, getEntityManagerToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';

/**
 * Boots the real `AppModule`'s dependency graph.
 *
 * Nothing else in the suite does this: unit tests construct providers by hand, and the e2e
 * suites assemble their own trimmed-down test modules. So a wiring mistake in `AppModule` or in
 * any module it imports — an unresolvable injection, a provider exported by a module that
 * doesn't declare it, a cycle — reaches `npm run start` unnoticed, past a clean `typecheck`,
 * `lint`, `build`, and full unit run. That is exactly how a broken `AuditModule` export shipped.
 *
 * `compile()` runs Nest's dependency scanner and instantiates providers, which is where those
 * errors surface. TypeORM opens its connection inside a provider factory (not `onModuleInit`),
 * so the `DataSource` token is stubbed out — this test is about the shape of the object graph,
 * not about talking to Postgres. Real database behaviour stays the e2e suites' job.
 */

/** Enough of a `DataSource` for `forFeature`'s repository factories and `@InjectDataSource()`. */
const stubDataSource = {
  entityMetadatas: [],
  options: { type: 'postgres' },
  isInitialized: true,
  getRepository: () => ({}),
  createQueryRunner: () => ({}),
  query: async () => [],
  destroy: async () => undefined,
  manager: {},
};
describe('AppModule wiring', () => {
  const ORIGINAL_ENV = process.env;

  beforeAll(() => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'test',
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_USERNAME: 'unused',
      DB_PASSWORD: 'unused',
      DB_NAME: 'unused',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('resolves every provider in the real module graph', async () => {
    // Imported after the env is in place: ConfigModule validates at class-decoration time.
    const { AppModule } = await import('../src/app.module');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDataSourceToken())
      .useValue(stubDataSource)
      .overrideProvider(getEntityManagerToken())
      .useValue(stubDataSource.manager)
      .compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
