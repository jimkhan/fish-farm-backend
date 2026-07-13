import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '../../../shared-kernel/errors/domain-error';
import { ProjectRole } from '../../../shared-kernel/tenant/membership-resolver.port';
import { ROLES_KEY, RolesMetadata } from './roles.decorator';

interface GuardedRequest {
  tenant?: { role: ProjectRole };
}

/**
 * `RolesGuard` (TASK-010, MOD-02 F3, AC-023/025/026). Reads the role the global
 * `ProjectScopeGuard` already resolved onto `request.tenant.role` — this guard never resolves
 * membership itself, it only checks the `@Roles()` allow-list for the current route.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const meta = this.reflector.getAllAndOverride<RolesMetadata | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta || meta.roles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GuardedRequest>();
    const role = request.tenant?.role;
    if (!role || !meta.roles.includes(role)) {
      throw new ForbiddenError(meta.message);
    }
    return true;
  }
}
