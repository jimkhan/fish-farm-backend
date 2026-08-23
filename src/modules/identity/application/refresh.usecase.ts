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
 * Concurrent-refresh tolerance. A token superseded by rotation stays acceptable for this long,
 * during which presenting it mints a fresh successor instead of revoking the family.
 *
 * Why it is needed: the web app refreshes inside Next.js middleware, which runs on every
 * matched request. When the 15-minute access cookie lapses, a single link click issues the
 * navigation *and* an RSC prefetch in parallel — both carrying the same refresh cookie, because
 * the rotated one isn't set until the first response returns. Without this window the second
 * request looked exactly like a replay attack: the family was revoked, both tokens died, and
 * the owner was bounced to login mid-session. Two open tabs reproduced it every time.
 *
 * Why it is safe: only tokens with `rotatedAt` set qualify (see `RefreshToken.wasRotatedWithin`),
 * so tokens killed by replay detection or by a password reset are never resurrected. A genuinely
 * stolen token is replayed far outside a few seconds, and still trips family revocation.
 */
const ROTATION_GRACE_MS = 10_000;

/**
 * `POST /auth/refresh` (CON-002, FT-008, AC-019). Rotation: the presented token is marked
 * rotated and a new one is minted in the same family (R2). Replay (an already-rotated token
 * presented again, outside {@link ROTATION_GRACE_MS}) revokes the whole family, forcing
 * re-login (AC-019, edge case 4).
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

    const now = new Date();
    if (existing.isRevoked && !existing.wasRotatedWithin(ROTATION_GRACE_MS, now)) {
      // Replay: a token from this family was reused long after it was superseded — or it was
      // revoked outright by replay detection or a password reset. Nuke the family (AC-019).
      await this.refreshTokens.revokeFamily(existing.familyId, now);
      throw new TokenRevokedError();
    }
    if (existing.isExpired) {
      throw new TokenRevokedError();
    }

    const user = await this.users.findById(existing.userId);
    if (!user || !user.isActive) {
      throw new TokenRevokedError();
    }

    // Idempotent within the grace window: re-marking an already-rotated token is a no-op that
    // still yields the caller a usable successor, so parallel refreshes both succeed.
    await this.refreshTokens.markRotated(existing.id, now);

    const refreshTtlDays = this.config.get('JWT_REFRESH_TTL_DAYS', { infer: true });
    const rawNewToken = generateOpaqueToken();
    const newRefreshToken = RefreshToken.reconstitute({
      id: randomUUID(),
      userId: user.id,
      familyId: existing.familyId, // same family — rotation, not a new session
      tokenHash: hashOpaqueToken(rawNewToken),
      expiresAt: new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000),
      revokedAt: null,
      rotatedAt: null,
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
