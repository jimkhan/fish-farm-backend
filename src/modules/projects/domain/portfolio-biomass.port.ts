/**
 * Bound by MOD-04 (TASK-012). Declared here so MOD-03 stays acyclic — MOD-04 depends on MOD-03 (a
 * pond belongs to a project), so MOD-03 cannot import MOD-04 back; mirrors `ProvisionFirstPondPort`.
 */
export interface PortfolioBiomassPort {
  getTotalBiomassKg(projectId: string): Promise<number>;
}

export const PORTFOLIO_BIOMASS = 'PortfolioBiomassPort';
