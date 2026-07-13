import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/** TASK-017: adds `alert.escalated_at` (R7) — a documented ERD gap this task adds, synced back. */
export class AddAlertEscalatedAt1783470600000 implements MigrationInterface {
  name = 'AddAlertEscalatedAt1783470600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'alert',
      new TableColumn({
        name: 'escalated_at',
        type: 'timestamptz',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('alert', 'escalated_at');
  }
}
