import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ProjectScopeGuard } from './project-scope.guard';
import { TenantContext } from './tenant-context';

/**
 * Shared-kernel tenant isolation (TASK-004, FT-003/004, ADR-006). Registers the project-scope
 * guard globally — every request passes it before any handler (R4) — and exports the
 * request-scoped `TenantContext` for modules to build `ScopedRepository` instances from.
 *
 * `MembershipResolverPort` stays unbound here; MOD-02 provides it (TASK-010). Until then the
 * guard fails closed: every project-scoped request is denied.
 */
@Module({
  providers: [TenantContext, { provide: APP_GUARD, useClass: ProjectScopeGuard }],
  exports: [TenantContext],
})
export class TenantModule {}
