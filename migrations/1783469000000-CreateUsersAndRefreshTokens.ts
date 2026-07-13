import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * TASK-008: `user` and `refresh_token` tables (FT-008, ERD `USER`/`REFRESH_TOKEN`). Neither is
 * project-owned — `user` is global, `refresh_token` scopes to a user, not a project.
 */
export class CreateUsersAndRefreshTokens1783469000000 implements MigrationInterface {
  name = 'CreateUsersAndRefreshTokens1783469000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'email', type: 'varchar', isNullable: false },
          { name: 'name', type: 'varchar', isNullable: false },
          { name: 'password_hash', type: 'varchar', isNullable: false },
          { name: 'status', type: 'varchar', isNullable: false, default: "'ACTIVE'" },
          { name: 'created_at', type: 'timestamptz', isNullable: false, default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'user',
      new TableIndex({ name: 'UQ_user_email', columnNames: ['email'], isUnique: true }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'refresh_token',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'family_id', type: 'varchar', isNullable: false },
          { name: 'token_hash', type: 'varchar', isNullable: false },
          { name: 'expires_at', type: 'timestamptz', isNullable: false },
          { name: 'revoked_at', type: 'timestamptz', isNullable: true },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'refresh_token',
      new TableIndex({ name: 'IDX_refresh_token_user_id', columnNames: ['user_id'] }),
    );
    await queryRunner.createIndex(
      'refresh_token',
      new TableIndex({ name: 'IDX_refresh_token_family_id', columnNames: ['family_id'] }),
    );
    await queryRunner.createIndex(
      'refresh_token',
      new TableIndex({ name: 'UQ_refresh_token_hash', columnNames: ['token_hash'], isUnique: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('refresh_token');
    await queryRunner.dropTable('user');
  }
}
