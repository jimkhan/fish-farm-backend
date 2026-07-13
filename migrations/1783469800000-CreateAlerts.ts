import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/** TASK-015: `alert` table (FT-050, ERD `ALERT` + `source_ref`/`resolved_at`). Project-owned. */
export class CreateAlerts1783469800000 implements MigrationInterface {
  name = 'CreateAlerts1783469800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'alert',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'type', type: 'varchar', isNullable: false },
          { name: 'severity', type: 'varchar', isNullable: false },
          { name: 'state', type: 'varchar', isNullable: false, default: "'RAISED'" },
          { name: 'message', type: 'varchar', isNullable: false },
          { name: 'source_ref', type: 'varchar', isNullable: false },
          { name: 'dedup_key', type: 'varchar', isNullable: false },
          { name: 'raised_at', type: 'timestamptz', isNullable: false, default: 'now()' },
          { name: 'acknowledged_at', type: 'timestamptz', isNullable: true },
          { name: 'resolved_at', type: 'timestamptz', isNullable: true },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'alert',
      new TableIndex({ name: 'IDX_alert_project_id', columnNames: ['project_id'] }),
    );
    // Not unique: dedup only cares about ACTIVE (non-RESOLVED) matches — see alert.persistence-model.ts.
    await queryRunner.createIndex(
      'alert',
      new TableIndex({ name: 'IDX_alert_dedup_key', columnNames: ['dedup_key'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('alert');
  }
}
