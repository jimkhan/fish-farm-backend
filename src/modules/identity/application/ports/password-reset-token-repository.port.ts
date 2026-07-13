import { PasswordResetToken } from '../../domain/password-reset-token.entity';

export interface PasswordResetTokenRepositoryPort {
  save(token: PasswordResetToken): Promise<void>;
  findByHash(tokenHash: string): Promise<PasswordResetToken | null>;
  markUsed(id: string, usedAt: Date): Promise<void>;
}

export const PASSWORD_RESET_TOKEN_REPOSITORY = 'PasswordResetTokenRepositoryPort';
