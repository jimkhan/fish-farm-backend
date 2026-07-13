import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { ScopeRequiredError } from '../errors/domain-error';
import { ProjectRole } from './membership-resolver.port';

/** Tenant scope the guard attaches to the request after membership resolution. */
export interface TenantState {
  userId: string;
  projectId: string;
  role: ProjectRole;
}

/** The request slice the tenant kernel touches — structural, no `@types/express` needed. */
export interface RequestWithTenant {
  tenant?: TenantState;
}

/**
 * Request-scoped view of the resolved tenant scope (TASK-004, FT-003). Populated exclusively
 * by `ProjectScopeGuard` from server-resolved membership — never from client input (R3).
 *
 * Reading any property before the guard populated it throws `ScopeRequiredError` (→ 400), so
 * an unscoped code path fails **before** a query can reach a project-owned table (AC-005, R2).
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  constructor(@Inject(REQUEST) private readonly request: RequestWithTenant) {}

  get isPopulated(): boolean {
    return this.request.tenant !== undefined;
  }

  private get state(): TenantState {
    if (this.request.tenant === undefined) {
      throw new ScopeRequiredError();
    }
    return this.request.tenant;
  }

  get userId(): string {
    return this.state.userId;
  }

  get projectId(): string {
    return this.state.projectId;
  }

  get role(): ProjectRole {
    return this.state.role;
  }
}
