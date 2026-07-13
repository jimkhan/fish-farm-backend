import { ProjectMembership } from '../../domain/project-membership.entity';

/**
 * Cross-project reads, by project (TASK-015) — the mirror of `MembershipDirectoryPort` (by
 * user). Used by MOD-09's `RecipientResolver`, which runs on `DomainEventBus` delivery (raising
 * an alert), not inside an HTTP request — no `TenantContext` exists there, the same structural
 * exception as `MembershipResolverPort`/`MembershipDirectoryPort` (MOD-01 §4.6).
 */
export interface ProjectMembersDirectoryPort {
  /** Every ACTIVE membership of `projectId`, across all its members. */
  findActiveByProjectId(projectId: string): Promise<ProjectMembership[]>;
}

export const PROJECT_MEMBERS_DIRECTORY = 'ProjectMembersDirectoryPort';
