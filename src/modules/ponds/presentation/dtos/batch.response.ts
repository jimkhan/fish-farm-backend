import { Batch } from '../../domain/batch.entity';

/** Wire shape of the `Batch` schema (contracts/openapi.yaml). */
export interface BatchResponse {
  id: string;
  projectId: string;
  pondId: string;
  speciesId: string;
  initialCount: number;
  cumulativeMortality: number;
  harvestedCount: number;
  /** Fish still in the pond: initial − mortality − harvested. Drives biomass and feed. */
  survivalEstimate: number;
  /**
   * Fish that did not die: initial − mortality. Drives survival rate — a harvested fish survived,
   * so it must not be counted as a loss. Derived here rather than on each surface so web and
   * mobile cannot disagree about what "survival" means.
   */
  survivorsExcludingHarvest: number;
  latestAvgWeightG: number | null;
  status: string;
  stockedOn: string;
}

export function toBatchResponse(batch: Batch): BatchResponse {
  return {
    id: batch.id,
    projectId: batch.projectId,
    pondId: batch.pondId,
    speciesId: batch.speciesId,
    initialCount: batch.initialCount,
    cumulativeMortality: batch.cumulativeMortality,
    harvestedCount: batch.harvestedCount,
    survivalEstimate: batch.survivalEstimate,
    survivorsExcludingHarvest: batch.survivorsExcludingHarvest,
    latestAvgWeightG: batch.latestAvgWeightG,
    status: batch.status,
    stockedOn: batch.stockedOn.toISOString().slice(0, 10),
  };
}
