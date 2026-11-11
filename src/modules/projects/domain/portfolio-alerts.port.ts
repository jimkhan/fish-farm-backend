/**
 * Bound by MOD-09 (TASK-012). Declared here so MOD-03 stays acyclic — MOD-09 depends on MOD-03
 * (project context), so MOD-03 cannot import MOD-09 back; mirrors `ProvisionFirstPondPort`.
 */
export interface PortfolioAlertsPort {
  /** Open (non-RESOLVED) CRITICAL alert count per project, keyed by project id. A project with
   * none may be absent from the map; the caller treats a miss as zero. Batched — see
   * `PortfolioBiomassPort`. */
  countOpenCriticalFor(projectIds: readonly string[]): Promise<Map<string, number>>;
}

export const PORTFOLIO_ALERTS = 'PortfolioAlertsPort';
