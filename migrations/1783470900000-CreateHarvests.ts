import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/** TASK-031: `harvest` table (FT-044, ERD `HARVEST` + `client_mutation_id` gap synced back). Project-owned. */
export class CreateHarvests1783470900000 implements MigrationInterface {
  name = 'CreateHarvests1783470900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'harvest',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'batch_id', type: 'uuid', isNullable: false },
          { name: 'quantity', type: 'int', isNullable: false },
          { name: 'total_weight_kg', type: 'double precision', isNullable: false },
          { name: 'grade', type: 'varchar', isNullable: false },
          { name: 'harvested_on', type: 'date', isNullable: false },
          { name: 'revenue_minor', type: 'int', isNullable: true },
          { name: 'client_mutation_id', type: 'varchar', isNullable: false },
          { name: 'created_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'harvest',
      new TableIndex({ name: 'IDX_harvest_project_id', columnNames: ['project_id'] }),
    );
    await queryRunner.createIndex(
      'harvest',
      new TableIndex({ name: 'IDX_harvest_batch_id', columnNames: ['batch_id'] }),
    );
    await queryRunner.createIndex(
      'harvest',
      new TableIndex({
        name: 'UQ_harvest_client_mutation_id',
        columnNames: ['client_mutation_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('harvest');
  }
}
