import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * TASK-023: `water_reading` + `water_threshold` tables (FT-032/033, ERD `WATER_READING`/
 * `WATER_THRESHOLD`). Project-owned. Seeded defaults live in code (`default-thresholds.ts`), not
 * as seeded rows — a project has no `water_threshold` rows until the Owner explicitly configures
 * one (AC-085's "or seeded defaults are used" fallback).
 */
export class CreateWater1783470200000 implements MigrationInterface {
  name = 'CreateWater1783470200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'water_reading',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'pond_id', type: 'uuid', isNullable: false },
          { name: 'parameter', type: 'varchar', isNullable: false },
          { name: 'value', type: 'double precision', isNullable: false },
          { name: 'source', type: 'varchar', isNullable: false },
          { name: 'device_id', type: 'uuid', isNullable: true },
          { name: 'read_at', type: 'timestamptz', isNullable: false },
          { name: 'client_mutation_id', type: 'varchar', isNullable: false },
          { name: 'created_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'water_reading',
      new TableIndex({ name: 'IDX_water_reading_project_id', columnNames: ['project_id'] }),
    );
    await queryRunner.createIndex(
      'water_reading',
      new TableIndex({ name: 'IDX_water_reading_pond_id', columnNames: ['pond_id'] }),
    );
    await queryRunner.createIndex(
      'water_reading',
      new TableIndex({ name: 'IDX_water_reading_parameter', columnNames: ['parameter'] }),
    );
    await queryRunner.createIndex(
      'water_reading',
      new TableIndex({ name: 'IDX_water_reading_read_at', columnNames: ['read_at'] }),
    );
    await queryRunner.createIndex(
      'water_reading',
      new TableIndex({
        name: 'UQ_water_reading_client_mutation_id',
        columnNames: ['client_mutation_id'],
        isUnique: true,
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'water_threshold',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'parameter', type: 'varchar', isNullable: false },
          { name: 'min', type: 'double precision', isNullable: true },
          { name: 'max', type: 'double precision', isNullable: true },
          { name: 'critical', type: 'double precision', isNullable: true },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'water_threshold',
      new TableIndex({ name: 'IDX_water_threshold_project_id', columnNames: ['project_id'] }),
    );
    await queryRunner.createIndex(
      'water_threshold',
      new TableIndex({ name: 'IDX_water_threshold_parameter', columnNames: ['parameter'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('water_threshold');
    await queryRunner.dropTable('water_reading');
  }
}
