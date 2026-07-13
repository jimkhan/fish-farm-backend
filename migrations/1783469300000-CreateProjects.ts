import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * TASK-011: `project` table (FT-012, ERD `PROJECT`). Not project-owned — `Project` IS the
 * tenant/isolation boundary, so there is no `project_id` column on it.
 */
export class CreateProjects1783469300000 implements MigrationInterface {
  name = 'CreateProjects1783469300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'project',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'name', type: 'varchar', isNullable: false },
          { name: 'site_lat', type: 'double precision', isNullable: false },
          { name: 'site_lng', type: 'double precision', isNullable: false },
          { name: 'address', type: 'varchar', isNullable: true },
          { name: 'currency', type: 'varchar', isNullable: false, default: "'BDT'" },
          { name: 'land_unit', type: 'varchar', isNullable: false, default: "'BIGHA'" },
          { name: 'status', type: 'varchar', isNullable: false, default: "'ACTIVE'" },
          { name: 'created_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    // Keyset pagination order for CON-006 (`findPage`'s ORDER BY created_at, id).
    await queryRunner.createIndex(
      'project',
      new TableIndex({ name: 'IDX_project_created_at_id', columnNames: ['created_at', 'id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('project');
  }
}
