/**
 * Bootstraps the creator's `OWNER` membership for a brand-new project (TASK-011, MOD-03 R1/AC-030,
 * consumed directly by MOD-03 — MOD-03 depends on MOD-02, no inversion needed here, unlike
 * `ProvisionFirstPondPort`). Deliberately not `ProjectMembershipRepositoryPort` (tenant-scoped):
 * no `TenantContext` exists yet for a project that doesn't exist until this call returns.
 */
export interface InitialOwnerMembershipPort {
  createForNewProject(userId: string, projectId: string): Promise<void>;
}

export const INITIAL_OWNER_MEMBERSHIP = 'InitialOwnerMembershipPort';
