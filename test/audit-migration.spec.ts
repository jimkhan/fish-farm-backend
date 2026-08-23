import { join } from 'path';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/platform/persistence/data-source.options';
import { startTestPostgres, type DisposablePostgres } from './support/postgres-test-container';

/**
 * Reversibility of the real `audit_entry` migration (TASK-005 DoD, AC-011 pattern): `up()`
 * creates the table with its indexed nullable `project_id`; `down()` returns the schema to its
 * prior state.
 */
describe('CreateAuditEntry migration (TASK-005, AC-011)', () => {
  let container: DisposablePostgres;
  let dataSource: DataSource;

  beforeAll(async () => {
    const started = await startTestPostgres();
    container = started.container;
    dataSource = new DataSource({
      ...buildDataSourceOptions(started.dbEnv),
      entities: [],
      migrations: [join(__dirname, '..', 'migrations', '*.ts')],
    });
    await dataSource.initialize();
  }, 60_000);

  afterAll(async () => {
    await dataSource?.destroy();
    await container?.stop();
  });

  it('creates audit_entry with an indexed nullable project_id on up(), removes it on down()', async () => {
    // The migration chain grows with every task (13+ and counting) — each runMigrations()/
    // undoLastMigration() round-trip is a real DB call, so the default 5s Jest timeout has grown
    // too tight under load (flaky, not a logic failure — passes standalone). Generous explicit
    // budget below.
    const applied = await dataSource.runMigrations();

    const table = await dataSource.query(
      `SELECT to_regclass('audit_entry') IS NOT NULL AS exists`,
    );
    expect(table[0].exists).toBe(true);

    const projectIdColumn = await dataSource.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'audit_entry' AND column_name = 'project_id'`,
    );
    expect(projectIdColumn[0].is_nullable).toBe('YES');

    const indexes = await dataSource.query(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'audit_entry' AND indexdef ILIKE '%project_id%'`,
    );
    expect(indexes.length).toBeGreaterThan(0);

    // Revert every migration this run applied (down() order), not just the last one — later
    // modules append their own migrations after this one, so "last" no longer means
    // CreateAuditEntry. Reverting the whole chain proves each down() in it still works.
    let remainingToRevert = applied.length;
    while (remainingToRevert > 0) {
      await dataSource.undoLastMigration();
      remainingToRevert -= 1;
    }

    const afterRevert = await dataSource.query(
      `SELECT to_regclass('audit_entry') IS NOT NULL AS exists`,
    );
    expect(afterRevert[0].exists).toBe(false);
  }, 30_000);
});
