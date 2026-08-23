import { Inject, Injectable } from '@nestjs/common';
import {
  MEMBERSHIP_DIRECTORY,
  MembershipDirectoryPort,
} from '../../identity/application/ports/membership-directory.port';
import { PORTFOLIO_ALERTS, PortfolioAlertsPort } from '../domain/portfolio-alerts.port';
import { PORTFOLIO_BIOMASS, PortfolioBiomassPort } from '../domain/portfolio-biomass.port';
import { PORTFOLIO_FINANCE, PortfolioFinancePort } from '../domain/portfolio-finance.port';
import { PROJECT_REPOSITORY, ProjectRepositoryPort } from './ports/project-repository.port';

export interface PortfolioProjectSummary {
  readonly projectId: string;
  readonly name: string;
  readonly biomassKg: number;
  readonly openAlerts: number;
}

export interface PortfolioSummaryResult {
  readonly totalBiomassKg: number;
  readonly openCriticalAlerts: number;
  readonly netProfitMinor: number;
  readonly currency: 'BDT';
  readonly projects: PortfolioProjectSummary[];
}

/**
 * `GET /portfolio/summary` (CON-035, FT-015, AC-034/035/112, R5/R8). Includes projects where
 * the caller is OWNER or INVESTOR — a query FILTER, not an access-denial rule. A pure Worker/
 * Partner (owner/investor of nothing) gets a valid empty portfolio rather than a 403.
 *
 * `netProfitMinor` (TASK-033): a real cross-project sum via `PortfolioFinancePort` — single BDT
 * amount, no per-currency subtotals (ADR-018; BACKLOG's TASK-033 entry supersedes the module
 * doc's pre-ADR-018 "per-currency subtotals" language). Previously hardcoded `0` (TASK-012's own
 * doc comment: "always zero until MOD-08 lands") — that wiring happens here.
 */
@Injectable()
export class PortfolioSummaryUseCase {
  constructor(
    @Inject(MEMBERSHIP_DIRECTORY) private readonly memberships: MembershipDirectoryPort,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    @Inject(PORTFOLIO_BIOMASS) private readonly biomass: PortfolioBiomassPort,
    @Inject(PORTFOLIO_ALERTS) private readonly alerts: PortfolioAlertsPort,
    @Inject(PORTFOLIO_FINANCE) private readonly finance: PortfolioFinancePort,
  ) {}

  async execute(userId: string): Promise<PortfolioSummaryResult> {
    const ownedMemberships = (await this.memberships.findActiveByUserId(userId)).filter(
      (m) => m.role === 'OWNER' || m.role === 'INVESTOR',
    );

    const projects = await Promise.all(
      ownedMemberships.map(async (membership) => {
        const project = await this.projects.findById(membership.projectId);
        const [biomassKg, openAlerts, netProfitMinor] = await Promise.all([
          this.biomass.getTotalBiomassKg(membership.projectId),
          this.alerts.countOpenCritical(membership.projectId),
          this.finance.getNetProfitMinor(membership.projectId),
        ]);
        return {
          projectId: membership.projectId,
          name: project?.name ?? '',
          biomassKg,
          openAlerts,
          netProfitMinor,
        };
      }),
    );

    return {
      totalBiomassKg: projects.reduce((sum, p) => sum + p.biomassKg, 0),
      openCriticalAlerts: projects.reduce((sum, p) => sum + p.openAlerts, 0),
      netProfitMinor: projects.reduce((sum, p) => sum + p.netProfitMinor, 0),
      currency: 'BDT',
      projects: projects.map(({ projectId, name, biomassKg, openAlerts }) => ({
        projectId,
        name,
        biomassKg,
        openAlerts,
      })),
    };
  }
}
