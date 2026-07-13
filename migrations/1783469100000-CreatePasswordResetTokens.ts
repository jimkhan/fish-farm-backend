import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * TASK-009: `password_reset_token` table (FT-009, ERD `PasswordResetToken`). Not project-owned —
 * scopes to a user, not a project (consciously allowlisted in the project-owned schema test,
 * TASK-004 AC-010, same as `refresh_token`).
 */
export class CreatePasswordResetTokens1783469100000 implements MigrationInterface {
  name = 'CreatePasswordResetTokens1783469100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'password_reset_token',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'token_hash', type: 'varchar', isNullable: false },
          { name: 'expires_at', type: 'timestamptz', isNullable: false },
          { name: 'used_at', type: 'timestamptz', isNullable: true },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'password_reset_token',
      new TableIndex({ name: 'IDX_password_reset_token_user_id', columnNames: ['user_id'] }),
    );
    await queryRunner.createIndex(
      'password_reset_token',
      new TableIndex({
        name: 'UQ_password_reset_token_hash',
        columnNames: ['token_hash'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('password_reset_token');
  }
}
