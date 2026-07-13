import { SetMetadata } from '@nestjs/common';
import { ProjectRole } from '../../../shared-kernel/tenant/membership-resolver.port';

export const ROLES_KEY = 'fms:roles';

export interface RolesMetadata {
  readonly roles: ProjectRole[];
  readonly message?: string;
}

/**
 * Requires `TenantContext.role` (set by the global `ProjectScopeGuard`) to be one of `roles`
 * (TASK-010, MOD-02 F3). Pair with `@UseGuards(RolesGuard)`. Reusable by any downstream module —
 * derive the role list from `rolesWithCapability()` (the capability matrix) rather than
 * hardcoding a role set, so the policy stays single-sourced (module doc §6.3).
 */
export const Roles = (roles: ProjectRole[], message?: string): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, { roles, message });
