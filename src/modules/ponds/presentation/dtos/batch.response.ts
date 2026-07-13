import { Batch } from '../../domain/batch.entity';

/** Wire shape of the `Batch` schema (contracts/openapi.yaml). */
export interface BatchResponse {
  id: string;
  projectId: string;
  pondId: string;
  speciesId: string;
  initialCount: number;
  cumulativeMortality: number;
  survivalEstimate: number;
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
    survivalEstimate: batch.survivalEstimate,
    latestAvgWeightG: batch.latestAvgWeightG,
    status: batch.status,
    stockedOn: batch.stockedOn.toISOString().slice(0, 10),
  };
}
