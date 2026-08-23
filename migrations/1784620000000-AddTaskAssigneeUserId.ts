import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

/** Optional task assignee (ACTIVE OWNER/WORKER user id on the project). */
export class AddTaskAssigneeUserId1784620000000 implements MigrationInterface {
  name = 'AddTaskAssigneeUserId1784620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'task',
      new TableColumn({
        name: 'assignee_user_id',
        type: 'uuid',
        isNullable: true,
      }),
    );
    await queryRunner.createIndex(
      'task',
      new TableIndex({
        name: 'IDX_task_assignee_user_id',
        columnNames: ['assignee_user_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('task', 'IDX_task_assignee_user_id');
    await queryRunner.dropColumn('task', 'assignee_user_id');
  }
}
