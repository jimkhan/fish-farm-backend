import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/** TASK-028: `mortality` table (FT-038, ERD `MORTALITY`). Project-owned. */
export class CreateMortalities1783469900000 implements MigrationInterface {
  name = 'CreateMortalities1783469900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'mortality',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'batch_id', type: 'uuid', isNullable: false },
          { name: 'count', type: 'int', isNullable: false },
          { name: 'cause_category', type: 'varchar', isNullable: false },
          { name: 'photo_url', type: 'varchar', isNullable: true },
          { name: 'occurred_at', type: 'timestamptz', isNullable: false },
          { name: 'client_mutation_id', type: 'varchar', isNullable: false },
          { name: 'created_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'mortality',
      new TableIndex({ name: 'IDX_mortality_project_id', columnNames: ['project_id'] }),
    );
    await queryRunner.createIndex(
      'mortality',
      new TableIndex({ name: 'IDX_mortality_batch_id', columnNames: ['batch_id'] }),
    );
    await queryRunner.createIndex(
      'mortality',
      new TableIndex({
        name: 'UQ_mortality_client_mutation_id',
        columnNames: ['client_mutation_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('mortality');
  }
}
