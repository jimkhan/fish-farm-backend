/**
 * Pure domain `RefreshToken` (TASK-008, MOD-02 §4.3/R2/R4, ERD `REFRESH_TOKEN`). The token
 * itself is never persisted — only `tokenHash` is — so a leaked database dump cannot be
 * replayed as a live session (mirrors `PasswordResetToken`'s design, MOD-02 R9).
 *
 * `familyId` groups every token minted from one login: rotation keeps the family alive;
 * presenting an already-rotated (revoked) token from a family revokes the *whole* family,
 * forcing re-login (R2 edge case 4 — replay detection).
 */
export interface RefreshTokenProps {
  readonly id: string;
  readonly userId: string;
  readonly familyId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export class RefreshToken {
  private constructor(private readonly props: RefreshTokenProps) {}

  static reconstitute(props: RefreshTokenProps): RefreshToken {
    return new RefreshToken(props);
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get familyId(): string {
    return this.props.familyId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }

  get isRevoked(): boolean {
    return this.props.revokedAt !== null;
  }

  get isExpired(): boolean {
    return this.props.expiresAt.getTime() <= Date.now();
  }

  /** A token is usable only if it is neither revoked nor expired. */
  get isUsable(): boolean {
    return !this.isRevoked && !this.isExpired;
  }
}
