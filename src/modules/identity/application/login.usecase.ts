import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../../platform/config/env.validation';
import { RefreshToken } from '../domain/refresh-token.entity';
import { InvalidCredentialsError } from '../domain/identity-errors';
import { ACCESS_TOKEN_ISSUER, AccessTokenIssuerPort } from './ports/access-token-issuer.port';
import { PASSWORD_HASHER, PasswordHasherPort } from './ports/password-hasher.port';
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepositoryPort,
} from './ports/refresh-token-repository.port';
import { USER_REPOSITORY, UserRepositoryPort } from './ports/user-repository.port';
import { AuthTokensResult } from './auth-tokens.result';
import { generateFamilyId, generateOpaqueToken, hashOpaqueToken } from './token-hash.util';

/** `POST /auth/login` (CON-001, FT-008, AC-015/016/017). */
@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepositoryPort,
    @Inject(ACCESS_TOKEN_ISSUER) private readonly accessTokens: AccessTokenIssuerPort,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async execute(email: string, password: string): Promise<AuthTokensResult> {
    const user = await this.users.findByEmail(email);

    // Single verify call regardless of outcome — same code path whether the account exists,
    // is deactivated, or the password is wrong, so response timing doesn't disclose which
    // (AC-016 no-enumeration; the hasher itself verifies against a dummy hash when hash is null).
    const passwordHash = user?.isActive ? user.passwordHash : null;
    const passwordValid = await this.hasher.verify(passwordHash, password);

    if (!user || !user.isActive || !passwordValid) {
      throw new InvalidCredentialsError();
    }

    const refreshTtlDays = this.config.get('JWT_REFRESH_TTL_DAYS', { infer: true });
    const accessToken = this.accessTokens.issue(user.id);
    const rawRefreshToken = generateOpaqueToken();
    const refreshToken = RefreshToken.reconstitute({
      id: randomUUID(),
      userId: user.id,
      familyId: generateFamilyId(),
      tokenHash: hashOpaqueToken(rawRefreshToken),
      expiresAt: new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000),
      revokedAt: null,
      rotatedAt: null,
    });
    await this.refreshTokens.save(refreshToken);

    return {
      accessToken: accessToken.token,
      refreshToken: rawRefreshToken,
      expiresIn: accessToken.expiresInSeconds,
    };
  }
}
