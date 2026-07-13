/**
 * Bound by MOD-04 (TASK-018). Declared here so MOD-03 stays acyclic — MOD-04 depends on MOD-03
 * (a pond belongs to a project), so MOD-03 cannot import MOD-04 back; this interface, not a
 * concrete class, is what MOD-04 implements and binds via DI token (mirrors the MOD-01/MOD-02
 * `MembershipResolverPort` pattern).
 */
export interface ProvisionFirstPondInput {
  readonly name: string;
  readonly area: number;
  readonly depthM?: number;
  readonly notes?: string;
}

export interface ProvisionFirstPondPort {
  /** Creates the project's first pond within the caller's already-open transaction (AC-032/068). */
  create(projectId: string, firstPond: ProvisionFirstPondInput): Promise<void>;
}

export const PROVISION_FIRST_POND = 'ProvisionFirstPondPort';
