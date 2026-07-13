import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * `password_reset_token` table (TASK-009, ERD `PasswordResetToken`). Not project-owned — scoped
 * to a user, not a project (consciously allowlisted in the project-owned schema test, TASK-004
 * AC-010, same as `refresh_token`).
 */
@Entity('password_reset_token')
export class PasswordResetTokenPersistenceModel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Index({ unique: true })
  @Column('varchar', { name: 'token_hash' })
  tokenHash!: string;

  @Column('timestamptz', { name: 'expires_at' })
  expiresAt!: Date;

  @Column('timestamptz', { name: 'used_at', nullable: true })
  usedAt!: Date | null;
}
