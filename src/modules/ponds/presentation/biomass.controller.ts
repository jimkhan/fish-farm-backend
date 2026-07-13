import { Controller, Get } from '@nestjs/common';
import { BiomassOverviewUseCase } from '../application/biomass-overview.usecase';

interface BiomassOverviewResponse {
  totalKg: number;
  perSpecies: { speciesId: string; biomassKg: number; survivalRate: number }[];
}

/** `GET /projects/{projectId}/biomass` (CON-043, AC-066). Member-only (any role). */
@Controller('projects/:projectId/biomass')
export class BiomassController {
  constructor(private readonly biomassOverview: BiomassOverviewUseCase) {}

  @Get()
  async getHandler(): Promise<BiomassOverviewResponse> {
    return this.biomassOverview.execute();
  }
}
