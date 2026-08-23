/**
 * Port through which the tenant guard resolves a caller's project memberships (TASK-004,
 * MOD-01 §4.6). Framework-free interface here; MOD-02 supplies the implementation via DI
 * (TASK-010), so the shared kernel has no build dependency on the identity module.
 */
export type ProjectRole = 'OWNER' | 'WORKER' | 'PARTNER' | 'INVESTOR';

export interface ProjectMembershipView {
  projectId: string;
  role: ProjectRole;
}

export interface MembershipResolverPort {
  /** All memberships of the given user — the sole source of truth for project scope (R3). */
  resolve(userId: string): Promise<ProjectMembershipView[]>;
}

/** DI token MOD-02 binds its implementation to. */
export const MEMBERSHIP_RESOLVER = 'MembershipResolverPort';
