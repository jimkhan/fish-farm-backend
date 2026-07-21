import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/** TASK-030: `pond_feed_accumulator` table (FT-043, MOD-07 §4.3). Project-owned, rebuildable projection. */
export class CreatePondFeedAccumulator1784260000000 implements MigrationInterface {
  name = 'CreatePondFeedAccumulator1784260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'pond_feed_accumulator',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'pond_id', type: 'uuid', isNullable: false },
          { name: 'total_feed_kg', type: 'double precision', isNullable: false, default: 0 },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'pond_feed_accumulator',
      new TableIndex({ name: 'IDX_pond_feed_accumulator_project_id', columnNames: ['project_id'] }),
    );
    await queryRunner.createIndex(
      'pond_feed_accumulator',
      new TableIndex({ name: 'UQ_pond_feed_accumulator_pond_id', columnNames: ['pond_id'], isUnique: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('pond_feed_accumulator');
  }
}
