import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../../platform/config/env.validation';
import { PasswordResetToken } from '../domain/password-reset-token.entity';
import {
  PASSWORD_RESET_NOTIFIER,
  PasswordResetNotifierPort,
} from './ports/password-reset-notifier.port';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  PasswordResetTokenRepositoryPort,
} from './ports/password-reset-token-repository.port';
import { USER_REPOSITORY, UserRepositoryPort } from './ports/user-repository.port';
import { generateOpaqueToken, hashOpaqueToken } from './token-hash.util';

/**
 * `POST /auth/password-reset/request` (CON-003, FT-009, AC-020). Always resolves — the
 * controller returns 202 regardless of outcome — so response shape/timing never discloses
 * whether the email belongs to an account (mirrors AC-016's no-enumeration rule for login).
 */
@Injectable()
export class RequestResetUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly resetTokens: PasswordResetTokenRepositoryPort,
    @Inject(PASSWORD_RESET_NOTIFIER) private readonly notifier: PasswordResetNotifierPort,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async execute(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user || !user.isActive) {
      return;
    }

    const ttlMinutes = this.config.get('PASSWORD_RESET_TTL_MINUTES', { infer: true });
    const rawToken = generateOpaqueToken();
    const resetToken = PasswordResetToken.reconstitute({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashOpaqueToken(rawToken),
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
      usedAt: null,
    });
    await this.resetTokens.save(resetToken);
    await this.notifier.send(user.email, rawToken);
  }
}
