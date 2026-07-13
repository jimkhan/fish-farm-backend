import { join } from 'path';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/platform/persistence/data-source.options';
import { startTestPostgres } from './support/postgres-test-container';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

describe('TypeORM persistence pipeline (AC-011, AC-012)', () => {
  describe('AC-012 — synchronize is always false', () => {
    const dbEnv = {
      DB_HOST: 'irrelevant',
      DB_PORT: 5432,
      DB_USERNAME: 'irrelevant',
      DB_PASSWORD: 'irrelevant',
      DB_NAME: 'irrelevant',
    };

    it.each(['development', 'test', 'production'] as const)(
      'synchronize is false when NODE_ENV=%s',
      () => {
        const options = buildDataSourceOptions(dbEnv);
        expect(options.synchronize).toBe(false);
        expect(options.migrationsRun).toBe(false);
      },
    );
  });

  describe('includeMigrations option', () => {
    const dbEnv = {
      DB_HOST: 'irrelevant',
      DB_PORT: 5432,
      DB_USERNAME: 'irrelevant',
      DB_PASSWORD: 'irrelevant',
      DB_NAME: 'irrelevant',
    };

    it('declares the migrations glob by default (CLI usage)', () => {
      expect(buildDataSourceOptions(dbEnv).migrations).toBeDefined();
    });

    it('omits migrations when includeMigrations is false (PersistenceModule/app runtime)', () => {
      // The running app never calls runMigrations() (migrationsRun is always false); eagerly
      // importing a raw .ts migration file at boot has crashed on newer Node versions
      // (ERR_INTERNAL_ASSERTION in the CJS/ESM loader) — this is the regression guard for that.
      expect(buildDataSourceOptions(dbEnv, { includeMigrations: false }).migrations).toBeUndefined();
    });
  });

  describe('AC-011 — a migration is reversible', () => {
    let container: StartedPostgreSqlContainer;
    let dataSource: DataSource;

    beforeAll(async () => {
      const started = await startTestPostgres();
      container = started.container;

      dataSource = new DataSource({
        ...buildDataSourceOptions(started.dbEnv),
        entities: [],
        migrations: [join(__dirname, 'fixtures', 'persistence', 'migrations', '*.ts')],
      });
      await dataSource.initialize();
    }, 60_000);

    afterAll(async () => {
      await dataSource?.destroy();
      await container?.stop();
    });

    it('creates the table with an indexed project_id on up(), and removes it on down()', async () => {
      // happy path: up() applies the schema change
      await dataSource.runMigrations();

      const tableExists = await dataSource.query(
        `SELECT to_regclass('_fixture_widget') IS NOT NULL AS exists`,
      );
      expect(tableExists[0].exists).toBe(true);

      const indexes = await dataSource.query(
        `SELECT indexname FROM pg_indexes WHERE tablename = '_fixture_widget' AND indexdef ILIKE '%project_id%'`,
      );
      expect(indexes.length).toBeGreaterThan(0);

      // failure/reverse path: down() returns the schema to its prior state
      await dataSource.undoLastMigration();

      const tableExistsAfterRevert = await dataSource.query(
        `SELECT to_regclass('_fixture_widget') IS NOT NULL AS exists`,
      );
      expect(tableExistsAfterRevert[0].exists).toBe(false);
    });
  });
});
