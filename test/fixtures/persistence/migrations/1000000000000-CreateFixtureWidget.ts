import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Test-only fixture migration proving the reversible migration pipeline (AC-011): `up()` then
 * `down()` on a clean database returns the schema to its prior state. Shapes a table exactly as
 * a `BaseProjectOwnedPersistenceModel` subclass would (uuid PK + indexed `project_id`), without
 * shipping a real business table — TASK-002's non-goal.
 */
export class CreateFixtureWidget1000000000000 implements MigrationInterface {
  name = 'CreateFixtureWidget1000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: '_fixture_widget',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'name', type: 'varchar', isNullable: false },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      '_fixture_widget',
      new TableIndex({ name: 'IDX_fixture_widget_project_id', columnNames: ['project_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('_fixture_widget', 'IDX_fixture_widget_project_id');
    await queryRunner.dropTable('_fixture_widget');
  }
}
