import { Inject, Injectable } from '@nestjs/common';
import {
  MEMBERSHIP_DIRECTORY,
  MembershipDirectoryPort,
} from '../../identity/application/ports/membership-directory.port';
import { PORTFOLIO_ALERTS, PortfolioAlertsPort } from '../domain/portfolio-alerts.port';
import { PORTFOLIO_BIOMASS, PortfolioBiomassPort } from '../domain/portfolio-biomass.port';
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
  /** P1 non-goal (BACKLOG: "no finance in P1 roll-up") — always zero until MOD-08 lands. */
  readonly netProfitMinor: number;
  readonly currency: 'BDT';
  readonly projects: PortfolioProjectSummary[];
}

/**
 * `GET /portfolio/summary` (CON-035, FT-015, AC-034/035, R5). "Includes only projects where the
 * caller is OWNER" is a query FILTER, not an access-denial rule — a pure Worker/Partner (owner of
 * nothing) gets a valid, empty portfolio rather than a 403 (the spec's own edge case 2 leaves
 * "403 or scoped redirect" as an explicit either/or; an empty, correctly-scoped result satisfies
 * both AC-034 and AC-035 without inventing a role gate).
 */
@Injectable()
export class PortfolioSummaryUseCase {
  constructor(
    @Inject(MEMBERSHIP_DIRECTORY) private readonly memberships: MembershipDirectoryPort,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    @Inject(PORTFOLIO_BIOMASS) private readonly biomass: PortfolioBiomassPort,
    @Inject(PORTFOLIO_ALERTS) private readonly alerts: PortfolioAlertsPort,
  ) {}

  async execute(userId: string): Promise<PortfolioSummaryResult> {
    const ownedMemberships = (await this.memberships.findActiveByUserId(userId)).filter(
      (m) => m.role === 'OWNER',
    );

    const projects = await Promise.all(
      ownedMemberships.map(async (membership) => {
        const project = await this.projects.findById(membership.projectId);
        const [biomassKg, openAlerts] = await Promise.all([
          this.biomass.getTotalBiomassKg(membership.projectId),
          this.alerts.countOpenCritical(membership.projectId),
        ]);
        return {
          projectId: membership.projectId,
          name: project?.name ?? '',
          biomassKg,
          openAlerts,
        };
      }),
    );

    return {
      totalBiomassKg: projects.reduce((sum, p) => sum + p.biomassKg, 0),
      openCriticalAlerts: projects.reduce((sum, p) => sum + p.openAlerts, 0),
      netProfitMinor: 0,
      currency: 'BDT',
      projects,
    };
  }
}
