import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * TASK-010: `project_membership` table (FT-010/FT-011, ERD `PROJECT_MEMBERSHIP` + `status`).
 * Genuinely project-owned — carries the indexed `project_id` every project-owned table must
 * (CLAUDE.md §5), so `ScopedRepository` composes it automatically for in-project reads/writes.
 */
export class CreateProjectMemberships1783469200000 implements MigrationInterface {
  name = 'CreateProjectMemberships1783469200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'project_membership',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'role', type: 'varchar', isNullable: false },
          { name: 'status', type: 'varchar', isNullable: false, default: "'ACTIVE'" },
          { name: 'created_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'project_membership',
      new TableIndex({ name: 'IDX_project_membership_project_id', columnNames: ['project_id'] }),
    );
    await queryRunner.createIndex(
      'project_membership',
      new TableIndex({ name: 'IDX_project_membership_user_id', columnNames: ['user_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('project_membership');
  }
}
