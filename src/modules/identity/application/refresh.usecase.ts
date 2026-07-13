import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../../platform/config/env.validation';
import { RefreshToken } from '../domain/refresh-token.entity';
import { TokenRevokedError } from '../domain/identity-errors';
import { ACCESS_TOKEN_ISSUER, AccessTokenIssuerPort } from './ports/access-token-issuer.port';
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepositoryPort,
} from './ports/refresh-token-repository.port';
import { USER_REPOSITORY, UserRepositoryPort } from './ports/user-repository.port';
import { AuthTokensResult } from './auth-tokens.result';
import { generateOpaqueToken, hashOpaqueToken } from './token-hash.util';

/**
 * `POST /auth/refresh` (CON-002, FT-008, AC-019). Rotation: the presented token is revoked and
 * a new one is minted in the same family (R2). Replay (an already-rotated token presented
 * again) revokes the whole family, forcing re-login (AC-019, edge case 4).
 */
@Injectable()
export class RefreshUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepositoryPort,
    @Inject(ACCESS_TOKEN_ISSUER) private readonly accessTokens: AccessTokenIssuerPort,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async execute(rawRefreshToken: string): Promise<AuthTokensResult> {
    const tokenHash = hashOpaqueToken(rawRefreshToken);
    const existing = await this.refreshTokens.findByHash(tokenHash);
    if (!existing) {
      throw new TokenRevokedError();
    }

    if (existing.isRevoked) {
      // Replay: a token from this family was reused. Nuke the whole family (AC-019).
      await this.refreshTokens.revokeFamily(existing.familyId, new Date());
      throw new TokenRevokedError();
    }
    if (existing.isExpired) {
      throw new TokenRevokedError();
    }

    const user = await this.users.findById(existing.userId);
    if (!user || !user.isActive) {
      throw new TokenRevokedError();
    }

    await this.refreshTokens.revokeById(existing.id, new Date());

    const refreshTtlDays = this.config.get('JWT_REFRESH_TTL_DAYS', { infer: true });
    const rawNewToken = generateOpaqueToken();
    const newRefreshToken = RefreshToken.reconstitute({
      id: randomUUID(),
      userId: user.id,
      familyId: existing.familyId, // same family — rotation, not a new session
      tokenHash: hashOpaqueToken(rawNewToken),
      expiresAt: new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000),
      revokedAt: null,
    });
    await this.refreshTokens.save(newRefreshToken);

    const accessToken = this.accessTokens.issue(user.id);
    return {
      accessToken: accessToken.token,
      refreshToken: rawNewToken,
      expiresIn: accessToken.expiresInSeconds,
    };
  }
}
