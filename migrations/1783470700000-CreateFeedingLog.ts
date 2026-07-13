import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/** TASK-022: `feeding_log` table (FT-027/028, ERD `FEEDING_LOG`). Project-owned. */
export class CreateFeedingLog1783470700000 implements MigrationInterface {
  name = 'CreateFeedingLog1783470700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'feeding_log',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'batch_id', type: 'uuid', isNullable: false },
          { name: 'inventory_item_id', type: 'uuid', isNullable: false },
          { name: 'qty_kg', type: 'double precision', isNullable: false },
          { name: 'observation', type: 'varchar', isNullable: true },
          { name: 'fed_at', type: 'timestamptz', isNullable: false },
          { name: 'client_mutation_id', type: 'varchar', isNullable: false },
          { name: 'created_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'feeding_log',
      new TableIndex({ name: 'IDX_feeding_log_project_id', columnNames: ['project_id'] }),
    );
    await queryRunner.createIndex(
      'feeding_log',
      new TableIndex({ name: 'IDX_feeding_log_batch_id', columnNames: ['batch_id'] }),
    );
    await queryRunner.createIndex(
      'feeding_log',
      new TableIndex({ name: 'IDX_feeding_log_inventory_item_id', columnNames: ['inventory_item_id'] }),
    );
    await queryRunner.createIndex(
      'feeding_log',
      new TableIndex({
        name: 'UQ_feeding_log_client_mutation_id',
        columnNames: ['client_mutation_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('feeding_log');
  }
}
