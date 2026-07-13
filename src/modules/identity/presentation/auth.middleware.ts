import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { UnauthenticatedError } from '../../../shared-kernel/errors/domain-error';
import {
  ACCESS_TOKEN_ISSUER,
  AccessTokenIssuerPort,
} from '../application/ports/access-token-issuer.port';
import { USER_REPOSITORY, UserRepositoryPort } from '../application/ports/user-repository.port';

/** Request slice this middleware reads/writes. `user` is what `ProjectScopeGuard` and `AuditInterceptor` expect. */
interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: { id: string };
}

/**
 * Global authentication middleware (TASK-008, ADR-005, AC-028). Runs before every guard —
 * middleware is first in Nest's request lifecycle, unlike `APP_GUARD`s whose relative order
 * across modules isn't guaranteed — so `request.user` is reliably populated before
 * `ProjectScopeGuard`/`AuditInterceptor` run (MOD-01 §4.6).
 *
 * No Authorization header → passes through untouched; this is how public routes (login,
 * refresh, health, calendar/convert) stay public without a `@Public()` allowlist to maintain.
 * A header IS present but invalid/expired, or names a deactivated/deleted user → rejected
 * immediately with `UnauthenticatedError` (401), regardless of the route — a client presenting
 * credentials gets real feedback about them rather than silent fallthrough.
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    @Inject(ACCESS_TOKEN_ISSUER) private readonly accessTokens: AccessTokenIssuerPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
  ) {}

  async use(req: AuthenticatedRequest, _res: unknown, next: (error?: unknown) => void): Promise<void> {
    const header = req.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    if (value === undefined) {
      next();
      return;
    }

    const [scheme, token] = value.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      next(new UnauthenticatedError('Session expired.'));
      return;
    }

    const verified = this.accessTokens.verify(token);
    if (!verified) {
      next(new UnauthenticatedError('Session expired.'));
      return;
    }

    // AC-028: a validly-signed token whose subject is deactivated/deleted is still rejected.
    const user = await this.users.findById(verified.sub);
    if (!user || !user.isActive) {
      next(new UnauthenticatedError('Session expired.'));
      return;
    }

    req.user = { id: user.id };
    next();
  }
}
