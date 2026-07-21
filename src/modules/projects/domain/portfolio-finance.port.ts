/**
 * Bound by MOD-08 (TASK-033). Declared here so MOD-03 stays acyclic — MOD-08 depends on MOD-03
 * (project context), so MOD-03 cannot import MOD-08 back; mirrors `PortfolioBiomassPort`/
 * `PortfolioAlertsPort` (TASK-012).
 */
export interface PortfolioFinancePort {
  getNetProfitMinor(projectId: string): Promise<number>;
}

export const PORTFOLIO_FINANCE = 'PortfolioFinancePort';
