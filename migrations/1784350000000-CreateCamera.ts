import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/** TASK-035: `camera` table (FT-053/054, ERD `CAMERA`, ADR-012). Project-owned. Read-only in
 * this task's scope — rows are provisioned out-of-band (no write endpoint exists). */
export class CreateCamera1784350000000 implements MigrationInterface {
  name = 'CreateCamera1784350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'camera',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'rtsp_url', type: 'varchar', isNullable: false },
          { name: 'stream_url', type: 'varchar', isNullable: false },
          { name: 'protocol', type: 'varchar', isNullable: false },
          { name: 'online', type: 'boolean', isNullable: false },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'camera',
      new TableIndex({ name: 'IDX_camera_project_id', columnNames: ['project_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('camera');
  }
}
