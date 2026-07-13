import { Inject, Injectable } from '@nestjs/common';
import { aggregateBiomassBySpecies, SpeciesBiomass, totalBiomassKg } from '../domain/biomass.service';
import { BATCH_REPOSITORY, BatchRepositoryPort } from './ports/batch-repository.port';

export interface BiomassOverviewResult {
  readonly totalKg: number;
  readonly perSpecies: SpeciesBiomass[];
}

/** `GET /projects/{projectId}/biomass` (CON-043, FT-022, AC-066). Member-only (any role). */
@Injectable()
export class BiomassOverviewUseCase {
  constructor(@Inject(BATCH_REPOSITORY) private readonly batches: BatchRepositoryPort) {}

  async execute(): Promise<BiomassOverviewResult> {
    const batches = await this.batches.findAllInCurrentProject();
    const perSpecies = aggregateBiomassBySpecies(
      batches.map((b) => ({
        speciesId: b.speciesId,
        survivalEstimate: b.survivalEstimate,
        initialCount: b.initialCount,
        latestAvgWeightG: b.latestAvgWeightG,
      })),
    );
    return { totalKg: totalBiomassKg(perSpecies), perSpecies };
  }
}
