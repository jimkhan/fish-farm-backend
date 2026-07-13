/**
 * Pure domain `PasswordResetToken` (TASK-009, MOD-02 §4.3/R9, ERD `PasswordResetToken`). Mirrors
 * `RefreshToken`'s design: the raw secret is never persisted, only `tokenHash`, and the entity is
 * single-use — `usedAt` (rather than a revoke) marks consumption (R9: used/expired rejected).
 */
export interface PasswordResetTokenProps {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
}

export class PasswordResetToken {
  private constructor(private readonly props: PasswordResetTokenProps) {}

  static reconstitute(props: PasswordResetTokenProps): PasswordResetToken {
    return new PasswordResetToken(props);
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get usedAt(): Date | null {
    return this.props.usedAt;
  }

  get isUsed(): boolean {
    return this.props.usedAt !== null;
  }

  get isExpired(): boolean {
    return this.props.expiresAt.getTime() <= Date.now();
  }

  /** A token is usable only if it is neither used nor expired (R9). */
  get isUsable(): boolean {
    return !this.isUsed && !this.isExpired;
  }
}
