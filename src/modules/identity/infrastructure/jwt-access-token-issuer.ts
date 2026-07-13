import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AppEnv } from '../../../platform/config/env.validation';
import {
  AccessTokenIssuerPort,
  IssuedAccessToken,
  VerifiedAccessToken,
} from '../application/ports/access-token-issuer.port';

interface AccessTokenPayload {
  sub: string;
}

/** Signs/verifies access-token JWTs via `@nestjs/jwt` (TASK-008, ADR-005, AC-018). */
@Injectable()
export class JwtAccessTokenIssuer implements AccessTokenIssuerPort {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  issue(userId: string): IssuedAccessToken {
    const expiresInSeconds = this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
    // Claims are `sub` only — no role/project (AC-018, R3). `@nestjs/jwt` adds `iat`/`exp`.
    const token = this.jwt.sign(
      { sub: userId } satisfies AccessTokenPayload,
      { expiresIn: expiresInSeconds },
    );
    return { token, expiresInSeconds };
  }

  verify(token: string): VerifiedAccessToken | null {
    try {
      const payload = this.jwt.verify<AccessTokenPayload>(token);
      return { sub: payload.sub };
    } catch {
      return null;
    }
  }
}
