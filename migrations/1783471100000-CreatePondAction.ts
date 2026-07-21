import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/** TASK-025: `pond_action` table (FT-035, ERD `POND_ACTION`). Project-owned. */
export class CreatePondAction1783471100000 implements MigrationInterface {
  name = 'CreatePondAction1783471100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'pond_action',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'pond_id', type: 'uuid', isNullable: false },
          { name: 'action_type', type: 'varchar', isNullable: false },
          { name: 'performed_at', type: 'timestamptz', isNullable: false },
          { name: 'notes', type: 'varchar', isNullable: true },
          { name: 'client_mutation_id', type: 'varchar', isNullable: false },
          { name: 'created_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'pond_action',
      new TableIndex({ name: 'IDX_pond_action_project_id', columnNames: ['project_id'] }),
    );
    await queryRunner.createIndex(
      'pond_action',
      new TableIndex({ name: 'IDX_pond_action_pond_id', columnNames: ['pond_id'] }),
    );
    await queryRunner.createIndex(
      'pond_action',
      new TableIndex({ name: 'IDX_pond_action_performed_at', columnNames: ['performed_at'] }),
    );
    await queryRunner.createIndex(
      'pond_action',
      new TableIndex({
        name: 'UQ_pond_action_client_mutation_id',
        columnNames: ['client_mutation_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('pond_action');
  }
}
