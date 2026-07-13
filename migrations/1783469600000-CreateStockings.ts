import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/** TASK-019: `stocking` table (FT-019, ERD `STOCKING`). Project-owned. */
export class CreateStockings1783469600000 implements MigrationInterface {
  name = 'CreateStockings1783469600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'stocking',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'pond_id', type: 'uuid', isNullable: false },
          { name: 'species_id', type: 'uuid', isNullable: false },
          { name: 'source', type: 'varchar', isNullable: true },
          { name: 'hatchery_name', type: 'varchar', isNullable: true },
          { name: 'count', type: 'int', isNullable: false },
          { name: 'stocked_on', type: 'date', isNullable: false },
          { name: 'stocking_cost_minor', type: 'int', isNullable: true },
          { name: 'currency', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'stocking',
      new TableIndex({ name: 'IDX_stocking_project_id', columnNames: ['project_id'] }),
    );
    await queryRunner.createIndex(
      'stocking',
      new TableIndex({ name: 'IDX_stocking_pond_id', columnNames: ['pond_id'] }),
    );
    await queryRunner.createIndex(
      'stocking',
      new TableIndex({ name: 'IDX_stocking_species_id', columnNames: ['species_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('stocking');
  }
}
