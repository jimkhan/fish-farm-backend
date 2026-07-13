import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { UserStatus } from '../../domain/user.entity';

/**
 * `user` table (TASK-008, ERD `USER` + `status`). Not project-owned — a global entity, so this
 * does NOT extend `BaseProjectOwnedPersistenceModel` (consciously allowlisted in the
 * project-owned schema test, TASK-004 AC-010).
 */
@Entity('user')
export class UserPersistenceModel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column('varchar')
  email!: string;

  @Column('varchar')
  name!: string;

  @Column('varchar', { name: 'password_hash' })
  passwordHash!: string;

  @Column('varchar', { default: 'ACTIVE' })
  status!: UserStatus;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
