/**
 * Bound by MOD-09 (TASK-012). Declared here so MOD-03 stays acyclic — MOD-09 depends on MOD-03
 * (project context), so MOD-03 cannot import MOD-09 back; mirrors `ProvisionFirstPondPort`.
 */
export interface PortfolioAlertsPort {
  countOpenCritical(projectId: string): Promise<number>;
}

export const PORTFOLIO_ALERTS = 'PortfolioAlertsPort';
