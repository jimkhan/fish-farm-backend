import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * TASK-027: `device` table (FT-037, ERD `DEVICE`, MOD-06 §4.3). Project-owned. Like `camera`
 * (TASK-035), rows are provisioned out-of-band — device registration (CON-056) is a separate,
 * still-reserved P3 task; this task implements only the device-key-authenticated ingestion path
 * (CON-044). `device_key_hash` stores a SHA-256 digest of the device key — the raw key is never
 * persisted (same posture as `refresh_token.token_hash`).
 */
export class CreateDevice1784530000000 implements MigrationInterface {
  name = 'CreateDevice1784530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'device',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'pond_id', type: 'uuid', isNullable: false },
          { name: 'device_key_hash', type: 'varchar', isNullable: false },
          { name: 'label', type: 'varchar', isNullable: false },
          { name: 'registered_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'device',
      new TableIndex({ name: 'IDX_device_project_id', columnNames: ['project_id'] }),
    );
    // The ingestion guard looks a device up by its key digest; a unique index enforces "one device
    // per key" and keeps that hot-path lookup indexed.
    await queryRunner.createIndex(
      'device',
      new TableIndex({
        name: 'IDX_device_key_hash',
        columnNames: ['device_key_hash'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('device');
  }
}
