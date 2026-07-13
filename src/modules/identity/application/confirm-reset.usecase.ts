import { Inject, Injectable } from '@nestjs/common';
import { ResetTokenInvalidError } from '../domain/identity-errors';
import { PASSWORD_HASHER, PasswordHasherPort } from './ports/password-hasher.port';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  PasswordResetTokenRepositoryPort,
} from './ports/password-reset-token-repository.port';
import { USER_REPOSITORY, UserRepositoryPort } from './ports/user-repository.port';
import { hashOpaqueToken } from './token-hash.util';

/** `POST /auth/password-reset/confirm` (CON-004, FT-009, AC-020, R9). */
@Injectable()
export class ConfirmResetUseCase {
  constructor(
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly resetTokens: PasswordResetTokenRepositoryPort,
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

    const passwordHash = await this.hasher.hash(newPassword);
    await this.users.updatePasswordHash(user.id, passwordHash);
    await this.resetTokens.markUsed(resetToken.id, new Date());
  }
}
