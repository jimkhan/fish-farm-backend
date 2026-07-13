import { User } from '../../domain/user.entity';

/** `User` is a global entity (no `project_id` — ERD `USER`), so this is a plain repository, not a `ScopedRepository`. */
export interface NewUserProps {
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
}

export interface UserRepositoryPort {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  /** Persists a new password hash for `userId` (TASK-009, AC-020). */
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  /** Creates a pending account for an invited email with no existing user (TASK-010, R8). */
  create(props: NewUserProps): Promise<User>;
}

export const USER_REPOSITORY = 'UserRepositoryPort';
