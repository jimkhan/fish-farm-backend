import { ProjectMembership } from '../../domain/project-membership.entity';

/**
 * Tenant-scoped membership access (TASK-010). Every method operates within the CURRENT request's
 * `TenantContext.projectId` — the implementation composes it via `ScopedRepository` (ADR-006), so
 * this port can never read/write another project's memberships. Cross-project reads (resolving a
 * user's memberships across ALL their projects, e.g. for the Worker-one-active-project check or
 * `GET /me`) go through the separate, already-existing `MembershipResolverPort` instead — that
 * port is the one sanctioned pre-scope/cross-project exception (MOD-01 §4.6).
 */
export interface ProjectMembershipRepositoryPort {
  /** All active memberships of the current project (`CON-010`). */
  findActiveByProjectId(): Promise<ProjectMembership[]>;
  /** Active `OWNER` memberships of the current project (R7 last-owner check). */
  countActiveOwners(): Promise<number>;
  /** A membership by id, scoped to the current project — `null` if it belongs to another project. */
  findById(membershipId: string): Promise<ProjectMembership | null>;
  save(membership: ProjectMembership): Promise<ProjectMembership>;
}

export const PROJECT_MEMBERSHIP_REPOSITORY = 'ProjectMembershipRepositoryPort';
