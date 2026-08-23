import { Inject, Injectable } from '@nestjs/common';
import { ResetTokenInvalidError } from '../domain/identity-errors';
import { PASSWORD_HASHER, PasswordHasherPort } from './ports/password-hasher.port';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  PasswordResetTokenRepositoryPort,
} from './ports/password-reset-token-repository.port';
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepositoryPort,
} from './ports/refresh-token-repository.port';
import { USER_REPOSITORY, UserRepositoryPort } from './ports/user-repository.port';
import { hashOpaqueToken } from './token-hash.util';

/**
 * `POST /auth/password-reset/confirm` (CON-004, FT-009, AC-020, R9).
 *
 * Completing a reset ends **every** existing session and burns every other outstanding reset
 * token for the account. Password reset is the compromise-recovery flow: changing the hash
 * alone only affects future logins, so an attacker holding a stolen refresh token would keep
 * minting access tokens for the remainder of `JWT_REFRESH_TTL_DAYS` (30 by default) — the
 * precise scenario the user just performed this reset to stop.
 */
@Injectable()
export class ConfirmResetUseCase {
  constructor(
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly resetTokens: PasswordResetTokenRepositoryPort,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
  ) {}

  async execute(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashOpaqueToken(rawToken);
    const resetToken = await this.resetTokens.findByHash(tokenHash);
    if (!resetToken || !resetToken.isUsable) {
      throw new ResetTokenInvalidError();
    }

    const user = await this.users.findById(resetToken.userId);
    if (!user || !user.isActive) {
      throw new ResetTokenInvalidError();
    }

    const now = new Date();
    const passwordHash = await this.hasher.hash(newPassword);
    await this.users.updatePasswordHash(user.id, passwordHash);
    await this.resetTokens.markUsed(resetToken.id, now);
    // Burn any other reset email still in flight, then end every live session on every device.
    // Both run in the request transaction the audit interceptor opened, so the password change
    // and the revocations commit together or not at all.
    await this.resetTokens.markAllUsedForUser(user.id, now);
    await this.refreshTokens.revokeAllForUser(user.id, now);
  }
}
