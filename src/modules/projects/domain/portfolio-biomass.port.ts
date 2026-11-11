/**
 * Bound by MOD-04 (TASK-012). Declared here so MOD-03 stays acyclic — MOD-04 depends on MOD-03 (a
 * pond belongs to a project), so MOD-03 cannot import MOD-04 back; mirrors `ProvisionFirstPondPort`.
 */
export interface PortfolioBiomassPort {
  /**
   * Total biomass per project, keyed by project id. Batched rather than per-project because the
   * portfolio dashboard is the first screen after login and fans out over every owned project —
   * a per-project call made query count grow with portfolio size. Projects with no batches may be
   * absent from the map; the caller treats a miss as zero.
   */
  getTotalBiomassKgFor(projectIds: readonly string[]): Promise<Map<string, number>>;
}

export const PORTFOLIO_BIOMASS = 'PortfolioBiomassPort';
