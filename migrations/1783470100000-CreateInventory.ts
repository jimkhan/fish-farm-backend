import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * TASK-020: `inventory_item` + `inventory_txn` tables (FT-029/030/031, ERD `INVENTORY_ITEM`/
 * `INVENTORY_TXN` + `cost_minor` — a documented ERD gap this task adds, synced back to ERD.md).
 * Project-owned.
 */
export class CreateInventory1783470100000 implements MigrationInterface {
  name = 'CreateInventory1783470100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'inventory_item',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'name', type: 'varchar', isNullable: false },
          { name: 'feed_type', type: 'varchar', isNullable: true },
          { name: 'unit', type: 'varchar', isNullable: false },
          { name: 'quantity', type: 'double precision', isNullable: false, default: 0 },
          { name: 'low_stock_threshold', type: 'double precision', isNullable: true },
          { name: 'created_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'inventory_item',
      new TableIndex({ name: 'IDX_inventory_item_project_id', columnNames: ['project_id'] }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'inventory_txn',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'item_id', type: 'uuid', isNullable: false },
          { name: 'delta', type: 'double precision', isNullable: false },
          { name: 'reason', type: 'varchar', isNullable: false },
          { name: 'cost_minor', type: 'int', isNullable: true },
          { name: 'occurred_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'inventory_txn',
      new TableIndex({ name: 'IDX_inventory_txn_project_id', columnNames: ['project_id'] }),
    );
    await queryRunner.createIndex(
      'inventory_txn',
      new TableIndex({ name: 'IDX_inventory_txn_item_id', columnNames: ['item_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('inventory_txn');
    await queryRunner.dropTable('inventory_item');
  }
}
