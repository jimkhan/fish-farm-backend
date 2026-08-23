import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Adds `refresh_token.rotated_at`, distinguishing the two reasons a token can carry a
 * `revoked_at`:
 *
 *  - **rotated** (`rotated_at` set) — superseded by the normal refresh flow. Presenting it again
 *    within a short grace window is a concurrent-request race, not an attack: the web app's
 *    Next.js middleware refreshes on every navigation, so a link click that also triggers an RSC
 *    prefetch sends the same token twice in parallel. Treating that as replay revoked the whole
 *    family and logged the user out mid-session.
 *  - **security-revoked** (`rotated_at` null) — killed by `revokeFamily` (replay detected) or
 *    `revokeAllForUser` (password reset). These must NEVER be eligible for the grace window, or
 *    a password reset could be undone by replaying a token it just revoked.
 *
 * Backfilled to `revoked_at` for existing rows: every revocation predating this migration came
 * from rotation or from replay detection, and grace is time-boxed anyway, so a backfilled value
 * is long expired by the time it is read.
 */
export class AddRefreshTokenRotatedAt1784890000000 implements MigrationInterface {
  name = 'AddRefreshTokenRotatedAt1784890000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'refresh_token',
      new TableColumn({ name: 'rotated_at', type: 'timestamptz', isNullable: true }),
    );
    await queryRunner.query(
      `UPDATE "refresh_token" SET "rotated_at" = "revoked_at" WHERE "revoked_at" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('refresh_token', 'rotated_at');
  }
}
