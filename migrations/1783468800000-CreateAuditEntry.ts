import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * TASK-005: the append-only `audit_entry` table (FT-005, NFR-012; ERD `AUDIT_ENTRY`).
 * `project_id` is nullable — platform-level actions (login, password reset) have no project —
 * and indexed for the owner-facing audit view reserved as CON-057. Reversible per AC-011.
 */
export class CreateAuditEntry1783468800000 implements MigrationInterface {
  name = 'CreateAuditEntry1783468800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'audit_entry',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: true },
          { name: 'actor_user_id', type: 'uuid', isNullable: true },
          { name: 'action', type: 'varchar', isNullable: false },
          { name: 'entity_type', type: 'varchar', isNullable: false },
          { name: 'entity_id', type: 'uuid', isNullable: true },
          { name: 'occurred_at', type: 'timestamptz', isNullable: false, default: 'now()' },
          { name: 'metadata', type: 'jsonb', isNullable: true },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'audit_entry',
      new TableIndex({ name: 'IDX_audit_entry_project_id', columnNames: ['project_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('audit_entry', 'IDX_audit_entry_project_id');
    await queryRunner.dropTable('audit_entry');
  }
}
