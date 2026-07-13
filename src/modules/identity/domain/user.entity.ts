/**
 * Pure domain `User` (TASK-008, MOD-02 §4.3, ERD `USER` + `status` per module doc §4.3/AC-028).
 * Framework-free — never carries TypeORM decorators (CLAUDE.md invariant #3); the persistence
 * model + mapper live in `infrastructure/persistence`.
 *
 * `status` is not yet in ERD.md's USER table (a documented gap this task closes — synced back
 * to ERD.md). `DEACTIVATED` covers both "deactivated" and "deleted" from AC-028's wording: this
 * module ships no hard-delete, only a soft status flip, consistent with the audit trail's
 * append-only design elsewhere in the system.
 */
export type UserStatus = 'ACTIVE' | 'DEACTIVATED';

export interface UserProps {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
  readonly status: UserStatus;
  readonly createdAt: Date;
}

export class User {
  private constructor(private readonly props: UserProps) {}

  static reconstitute(props: UserProps): User {
    return new User(props);
  }

  get id(): string {
    return this.props.id;
  }

  get email(): string {
    return this.props.email;
  }

  get name(): string {
    return this.props.name;
  }

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get status(): UserStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get isActive(): boolean {
    return this.props.status === 'ACTIVE';
  }
}
