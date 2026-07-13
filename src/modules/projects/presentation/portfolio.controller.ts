import { Controller, Get, Req } from '@nestjs/common';
import { UnauthenticatedError } from '../../../shared-kernel/errors/domain-error';
import { PortfolioSummaryUseCase } from '../application/portfolio-summary.usecase';

interface RequestWithUser {
  user?: { id: string };
}

interface PortfolioSummaryResponse {
  totalBiomassKg: number;
  openCriticalAlerts: number;
  netProfit: { amountMinor: number; currency: string };
  projects: { projectId: string; name: string; biomassKg: number; openAlerts: number }[];
}

/** `GET /portfolio/summary` (CON-035, AC-034/035). No `:projectId` — auth checked directly, like `/me`. */
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioSummary: PortfolioSummaryUseCase) {}

  @Get('summary')
  async summaryHandler(@Req() req: RequestWithUser): Promise<PortfolioSummaryResponse> {
    if (!req.user) {
      throw new UnauthenticatedError();
    }
    const result = await this.portfolioSummary.execute(req.user.id);
    return {
      totalBiomassKg: result.totalBiomassKg,
      openCriticalAlerts: result.openCriticalAlerts,
      netProfit: { amountMinor: result.netProfitMinor, currency: result.currency },
      projects: result.projects,
    };
  }
}
