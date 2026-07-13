import { ProjectMembership } from '../../domain/project-membership.entity';

/**
 * Cross-project membership reads for a single user (TASK-010) — deliberately NOT
 * `ScopedRepository`-based, the same sanctioned exception as `MembershipResolverPort` itself
 * (MOD-01 §4.6): resolving *all* of a user's memberships is inherently a pre-scope /
 * cross-project operation (used by `GET /me`, AC-021, and the Worker-one-active-project check,
 * AC-024) — there is no single `TenantContext.projectId` to scope it to.
 */
export interface MembershipDirectoryPort {
  /** Every ACTIVE membership of `userId`, across all projects, as full domain entities. */
  findActiveByUserId(userId: string): Promise<ProjectMembership[]>;
}

export const MEMBERSHIP_DIRECTORY = 'MembershipDirectoryPort';
