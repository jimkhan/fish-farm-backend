/**
 * Bound by MOD-08 (TASK-033). Declared here so MOD-03 stays acyclic — MOD-08 depends on MOD-03
 * (project context), so MOD-03 cannot import MOD-08 back; mirrors `PortfolioBiomassPort`/
 * `PortfolioAlertsPort` (TASK-012).
 */
export interface PortfolioFinancePort {
  /** Net profit (BDT minor units) per project, keyed by project id. A project with no
   * transactions may be absent from the map; the caller treats a miss as zero. Batched — see
   * `PortfolioBiomassPort`. */
  getNetProfitMinorFor(projectIds: readonly string[]): Promise<Map<string, number>>;
}

export const PORTFOLIO_FINANCE = 'PortfolioFinancePort';
