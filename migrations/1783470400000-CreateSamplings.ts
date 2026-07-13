import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/** TASK-029: `sampling` table (FT-041, ERD `SAMPLING`). Project-owned. */
export class CreateSamplings1783470400000 implements MigrationInterface {
  name = 'CreateSamplings1783470400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'sampling',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'project_id', type: 'uuid', isNullable: false },
          { name: 'batch_id', type: 'uuid', isNullable: false },
          { name: 'sample_size', type: 'int', isNullable: false },
          { name: 'avg_weight_g', type: 'double precision', isNullable: false },
          { name: 'sampled_on', type: 'date', isNullable: false },
          { name: 'client_mutation_id', type: 'varchar', isNullable: false },
          { name: 'created_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'sampling',
      new TableIndex({ name: 'IDX_sampling_project_id', columnNames: ['project_id'] }),
    );
    await queryRunner.createIndex(
      'sampling',
      new TableIndex({ name: 'IDX_sampling_batch_id', columnNames: ['batch_id'] }),
    );
    await queryRunner.createIndex(
      'sampling',
      new TableIndex({
        name: 'UQ_sampling_client_mutation_id',
        columnNames: ['client_mutation_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('sampling');
  }
}
