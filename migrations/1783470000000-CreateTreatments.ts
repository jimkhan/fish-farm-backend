import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * TASK-028: `treatment` table (FT-039, ERD `TREATMENT`). Project-owned. `export_safe_after` is
 * ERD's own "derived" annotation — computed, never a column.
 */
export class CreateTreatments1783470000000 implements MigrationInterface {
  name = 'CreateTreatments1783470000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'treatment',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'batch_id', type: 'uuid', isNullable: false },
          { name: 'product', type: 'varchar', isNullable: false },
          { name: 'dose', type: 'varchar', isNullable: false },
          { name: 'administered_on', type: 'date', isNullable: false },
          { name: 'withdrawal_days', type: 'int', isNullable: false },
          { name: 'created_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'treatment',
      new TableIndex({ name: 'IDX_treatment_project_id', columnNames: ['project_id'] }),
    );
    await queryRunner.createIndex(
      'treatment',
      new TableIndex({ name: 'IDX_treatment_batch_id', columnNames: ['batch_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('treatment');
  }
}
