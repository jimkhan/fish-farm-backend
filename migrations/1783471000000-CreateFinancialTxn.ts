import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/** TASK-032: `financial_txn` table (FT-046/049, ERD `FINANCIAL_TXN`). Project-owned. */
export class CreateFinancialTxn1783471000000 implements MigrationInterface {
  name = 'CreateFinancialTxn1783471000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'financial_txn',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'kind', type: 'varchar', isNullable: false },
          { name: 'category', type: 'varchar', isNullable: false },
          { name: 'amount_minor', type: 'int', isNullable: false },
          { name: 'occurred_on', type: 'date', isNullable: false },
          { name: 'source_ref', type: 'varchar', isNullable: true },
          { name: 'note', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'financial_txn',
      new TableIndex({ name: 'IDX_financial_txn_project_id', columnNames: ['project_id'] }),
    );
    await queryRunner.createIndex(
      'financial_txn',
      new TableIndex({
        name: 'UQ_financial_txn_source_ref',
        columnNames: ['source_ref'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('financial_txn');
  }
}
