import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UnauthenticatedError } from '../../../shared-kernel/errors/domain-error';
import { PUBLIC_KEY } from '../../../shared-kernel/auth/public.decorator';

interface GuardedRequest {
  params?: Record<string, string>;
  user?: { id: string };
}

/**
 * Global authentication guard. Requires `request.user` — populated by `AuthMiddleware` from a
 * valid bearer token — on every route not explicitly marked `@Public()`.
 *
 * This inverts the previous default. `AuthMiddleware` deliberately lets a request with **no**
 * `Authorization` header through untouched (that is how `/auth/login` stays reachable), so
 * before this guard existed the only thing standing between an anonymous caller and a handler
 * was either a `:projectId` route param (handled by `ProjectScopeGuard`) or a hand-written
 * `if (!req.user)` check inside the controller. Any route with neither was silently public —
 * `GET /species` in fact was, and every future non-project-scoped controller would have been by
 * omission. Making the safe case the default means exposure is now an explicit, greppable
 * `@Public()` rather than a missing line.
 *
 * Retained per-controller `if (!req.user) throw ...` checks are harmless defence in depth and
 * still do the TypeScript narrowing those handlers need for `req.user.id`.
 */
@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GuardedRequest>();

    // Defer on project-scoped routes: `ProjectScopeGuard` already denies them when there is no
    // authenticated user, and it does so with a uniform 403 that never reveals whether the
    // project exists (AC-004). Rejecting here first would turn that into a 401 and make the
    // response depend on which global guard happened to be registered first — Nest orders
    // `APP_GUARD`s by module import order, which is not a contract worth relying on. Letting
    // the tenant guard own these routes keeps the anti-enumeration behaviour deterministic.
    const projectId = request.params?.projectId;
    if (typeof projectId === 'string' && projectId.length > 0) {
      return true;
    }

    if (request.user === undefined) {
      throw new UnauthenticatedError();
    }
    return true;
  }
}
