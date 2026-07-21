import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/** TASK-036: `weather_snapshot` table (FT-055, ERD `WEATHER_SNAPSHOT`, ADR-018). Project-owned,
 * one cache row per project (unique-indexed `project_id`, not the PK — see the persistence
 * model's own doc comment for why). */
export class CreateWeatherSnapshot1784440000000 implements MigrationInterface {
  name = 'CreateWeatherSnapshot1784440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'weather_snapshot',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'temp_c', type: 'double precision', isNullable: false },
          { name: 'condition', type: 'varchar', isNullable: false },
          { name: 'heavy_rain', type: 'boolean', isNullable: false },
          { name: 'extreme_heat', type: 'boolean', isNullable: false },
          { name: 'fetched_at', type: 'timestamptz', isNullable: false },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'weather_snapshot',
      new TableIndex({
        name: 'UQ_weather_snapshot_project_id',
        columnNames: ['project_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('weather_snapshot');
  }
}
