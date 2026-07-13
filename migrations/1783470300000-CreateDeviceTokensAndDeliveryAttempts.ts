import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * TASK-016: `device_token` (ERD `DEVICE_TOKEN`) + `delivery_attempt` (module doc §4.3 — a
 * documented ERD gap this task adds, synced back). Both user/alert-owned, not project-owned.
 */
export class CreateDeviceTokensAndDeliveryAttempts1783470300000 implements MigrationInterface {
  name = 'CreateDeviceTokensAndDeliveryAttempts1783470300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'device_token',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'fcm_token', type: 'varchar', isNullable: false },
          { name: 'platform', type: 'varchar', isNullable: true },
          { name: 'registered_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'device_token',
      new TableIndex({ name: 'IDX_device_token_user_id', columnNames: ['user_id'] }),
    );
    await queryRunner.createIndex(
      'device_token',
      new TableIndex({
        name: 'UQ_device_token_fcm_token',
        columnNames: ['fcm_token'],
        isUnique: true,
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'delivery_attempt',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'alert_id', type: 'uuid', isNullable: false },
          { name: 'channel', type: 'varchar', isNullable: false },
          { name: 'status', type: 'varchar', isNullable: false },
          { name: 'attempted_at', type: 'timestamptz', isNullable: false, default: 'now()' },
          { name: 'error', type: 'varchar', isNullable: true },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'delivery_attempt',
      new TableIndex({ name: 'IDX_delivery_attempt_alert_id', columnNames: ['alert_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('delivery_attempt');
    await queryRunner.dropTable('device_token');
  }
}
