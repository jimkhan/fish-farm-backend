import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * TASK-019: `batch` table (FT-020, ERD `BATCH` + `harvested_count`/`stocking_id` — a documented
 * ERD gap this task closes, synced back to ERD.md). Project-owned.
 */
export class CreateBatches1783469700000 implements MigrationInterface {
  name = 'CreateBatches1783469700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'batch',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'pond_id', type: 'uuid', isNullable: false },
          { name: 'stocking_id', type: 'uuid', isNullable: false },
          { name: 'species_id', type: 'uuid', isNullable: false },
          { name: 'initial_count', type: 'int', isNullable: false },
          { name: 'cumulative_mortality', type: 'int', isNullable: false, default: 0 },
          { name: 'harvested_count', type: 'int', isNullable: false, default: 0 },
          { name: 'latest_avg_weight_g', type: 'double precision', isNullable: true },
          { name: 'status', type: 'varchar', isNullable: false, default: "'ACTIVE'" },
          { name: 'stocked_on', type: 'date', isNullable: false },
          { name: 'created_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'batch',
      new TableIndex({ name: 'IDX_batch_project_id', columnNames: ['project_id'] }),
    );
    await queryRunner.createIndex(
      'batch',
      new TableIndex({ name: 'IDX_batch_pond_id', columnNames: ['pond_id'] }),
    );
    await queryRunner.createIndex(
      'batch',
      new TableIndex({ name: 'IDX_batch_species_id', columnNames: ['species_id'] }),
    );
    await queryRunner.createIndex(
      'batch',
      new TableIndex({ name: 'UQ_batch_stocking_id', columnNames: ['stocking_id'], isUnique: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('batch');
  }
}
