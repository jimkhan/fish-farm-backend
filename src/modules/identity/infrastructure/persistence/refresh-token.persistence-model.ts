import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * `refresh_token` table (TASK-008, ERD `REFRESH_TOKEN`). Not project-owned — scoped to a user,
 * not a project (consciously allowlisted in the project-owned schema test, TASK-004 AC-010).
 */
@Entity('refresh_token')
export class RefreshTokenPersistenceModel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Index()
  @Column('varchar', { name: 'family_id' })
  familyId!: string;

  @Index({ unique: true })
  @Column('varchar', { name: 'token_hash' })
  tokenHash!: string;

  @Column('timestamptz', { name: 'expires_at' })
  expiresAt!: Date;

  @Column('timestamptz', { name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;
}
