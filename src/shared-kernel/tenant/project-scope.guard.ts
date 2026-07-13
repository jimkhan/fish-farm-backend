import { CanActivate, ExecutionContext, Inject, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError, ScopeRequiredError } from '../errors/domain-error';
import { MEMBERSHIP_RESOLVER, MembershipResolverPort } from './membership-resolver.port';
import { PROJECT_SCOPED_KEY } from './project-scoped.decorator';
import { RequestWithTenant } from './tenant-context';

/** Request slice the guard reads/writes. `user` is set by MOD-02's auth guard (TASK-008). */
interface GuardedRequest extends RequestWithTenant {
  params?: Record<string, string>;
  user?: { id: string };
}

/**
 * Global project-scope guard (TASK-004, FT-003, ADR-006). For every request that references a
 * project (a `:projectId` route param, or a route marked `@ProjectScoped()`), it resolves the
 * caller's memberships via `MembershipResolverPort` and populates `request.tenant` — or rejects
 * **before any handler runs** (R4):
 *
 * - non-member (or unauthenticated, or no resolver bound yet) → uniform `ForbiddenError`/403
 *   that never discloses whether the project exists (AC-004, anti-enumeration, MOD-01 §2.6);
 * - route marked project-scoped but carrying no `projectId` → `ScopeRequiredError`/400 (AC-005).
 *
 * Routes with no project reference (health, auth, /me, portfolio) pass through untouched.
 * The scope is derived only from server-resolved membership intersected with the route param —
 * never from a client-supplied header/body field (R3).
 */
@Injectable()
export class ProjectScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    // Optional so the app boots before MOD-02 binds an implementation — with no resolver the
    // guard denies every scoped request (fail closed, never open).
    @Optional()
    @Inject(MEMBERSHIP_RESOLVER)
    private readonly membershipResolver: MembershipResolverPort | null = null,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GuardedRequest>();

    const rawProjectId = request.params?.projectId;
    const projectId =
      typeof rawProjectId === 'string' && rawProjectId.length > 0 ? rawProjectId : undefined;

    if (projectId === undefined) {
      const scopeRequired =
        this.reflector.getAllAndOverride<boolean>(PROJECT_SCOPED_KEY, [
          context.getHandler(),
          context.getClass(),
        ]) === true;
      if (scopeRequired) {
        throw new ScopeRequiredError();
      }
      return true; // not a project-scoped route
    }

    const userId = request.user?.id;
    if (userId === undefined || this.membershipResolver === null) {
      throw new ForbiddenError();
    }

    const memberships = await this.membershipResolver.resolve(userId);
    const membership = memberships.find((m) => m.projectId === projectId);
    if (membership === undefined) {
      // Uniform denial — no lookup of the project itself, so existence is never disclosed.
      throw new ForbiddenError();
    }

    request.tenant = { userId, projectId, role: membership.role };
    return true;
  }
}
