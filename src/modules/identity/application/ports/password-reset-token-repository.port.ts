import { PasswordResetToken } from '../../domain/password-reset-token.entity';

export interface PasswordResetTokenRepositoryPort {
  save(token: PasswordResetToken): Promise<void>;
  findByHash(tokenHash: string): Promise<PasswordResetToken | null>;
  markUsed(id: string, usedAt: Date): Promise<void>;
  /**
   * Burns every still-unused reset token the user holds. A completed reset must not leave an
   * older, still-valid reset email usable — otherwise the previous token stays a live path to
   * the account for the remainder of its TTL.
   */
  markAllUsedForUser(userId: string, usedAt: Date): Promise<void>;
}

export const PASSWORD_RESET_TOKEN_REPOSITORY = 'PasswordResetTokenRepositoryPort';
