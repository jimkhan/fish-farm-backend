import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/** TASK-040: `sync_mutation` table (FT-065, ERD `SYNC_MUTATION`). Global idempotency store — not
 * project-owned; `client_mutation_id` (minted offline, ADR-016) is the primary key. */
export class CreateSyncMutation1783470800000 implements MigrationInterface {
  name = 'CreateSyncMutation1783470800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'sync_mutation',
        columns: [
          { name: 'client_mutation_id', type: 'varchar', isPrimary: true },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'entity', type: 'varchar', isNullable: false },
          { name: 'status', type: 'varchar', isNullable: false },
          { name: 'server_id', type: 'uuid', isNullable: true },
          { name: 'processed_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'sync_mutation',
      new TableIndex({ name: 'IDX_sync_mutation_project_id', columnNames: ['project_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('sync_mutation');
  }
}
