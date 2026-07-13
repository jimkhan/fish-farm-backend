import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/** TASK-018: `pond` table (FT-018, ERD `POND`). Project-owned — carries indexed `project_id`. */
export class CreatePonds1783469500000 implements MigrationInterface {
  name = 'CreatePonds1783469500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'pond',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'name', type: 'varchar', isNullable: false },
          { name: 'area', type: 'double precision', isNullable: false },
          { name: 'depth_m', type: 'double precision', isNullable: true },
          { name: 'notes', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'pond',
      new TableIndex({ name: 'IDX_pond_project_id', columnNames: ['project_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('pond');
  }
}
