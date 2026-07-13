import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/** TASK-041: `task` + `task_log` tables (FT-067/068, ERD `TASK`/`TASK_LOG`). Project-owned. */
export class CreateTasksAndTaskLogs1783470500000 implements MigrationInterface {
  name = 'CreateTasksAndTaskLogs1783470500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'task',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'pond_id', type: 'uuid', isNullable: true },
          { name: 'title', type: 'varchar', isNullable: false },
          { name: 'recurrence_days', type: 'int', isNullable: true },
          { name: 'status', type: 'varchar', isNullable: false },
          { name: 'due_on', type: 'date', isNullable: false },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'task',
      new TableIndex({ name: 'IDX_task_project_id', columnNames: ['project_id'] }),
    );
    await queryRunner.createIndex(
      'task',
      new TableIndex({ name: 'IDX_task_status', columnNames: ['status'] }),
    );
    await queryRunner.createIndex(
      'task',
      new TableIndex({ name: 'IDX_task_due_on', columnNames: ['due_on'] }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'task_log',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'task_id', type: 'uuid', isNullable: false },
          { name: 'completed_at', type: 'timestamptz', isNullable: false },
          { name: 'photo_url', type: 'varchar', isNullable: true },
          { name: 'client_mutation_id', type: 'varchar', isNullable: false },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'task_log',
      new TableIndex({ name: 'IDX_task_log_project_id', columnNames: ['project_id'] }),
    );
    await queryRunner.createIndex(
      'task_log',
      new TableIndex({ name: 'IDX_task_log_task_id', columnNames: ['task_id'] }),
    );
    await queryRunner.createIndex(
      'task_log',
      new TableIndex({
        name: 'UQ_task_log_client_mutation_id',
        columnNames: ['client_mutation_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('task_log');
    await queryRunner.dropTable('task');
  }
}
