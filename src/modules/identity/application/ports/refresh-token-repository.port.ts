import { RefreshToken } from '../../domain/refresh-token.entity';

export interface RefreshTokenRepositoryPort {
  save(token: RefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  /**
   * Marks exactly one token as superseded by rotation — the normal-refresh path (MOD-02 R2).
   * Stamps both `revokedAt` (it is no longer usable) and `rotatedAt` (the *reason*), which is
   * what makes it eligible for the brief concurrent-refresh grace window.
   */
  markRotated(id: string, rotatedAt: Date): Promise<void>;
  /** Revokes every currently-unrevoked token in the family — the replay-detected path (AC-019). */
  revokeFamily(familyId: string, revokedAt: Date): Promise<void>;
  /**
   * Revokes every currently-unrevoked token the user holds, across all families and devices —
   * the credential-change path. A password reset is the compromise-recovery flow, so it must
   * end sessions an attacker may already hold, not just change what a future login checks.
   */
  revokeAllForUser(userId: string, revokedAt: Date): Promise<void>;
}

export const REFRESH_TOKEN_REPOSITORY = 'RefreshTokenRepositoryPort';
