import { BatchSurvival, PondFcrResult } from '../../application/get-pond-fcr.usecase';

/** Wire shape of `GET .../ponds/{pondId}/fcr` (CON-058, AC-098/099). */
export interface BatchSurvivalResponse {
  batchId: string;
  speciesId: string;
  survivalRate: number;
}

export interface PondFcrResponse {
  pondId: string;
  totalFeedKg: number;
  biomassGainKg: number | null;
  fcr: number | null;
  batches: BatchSurvivalResponse[];
}

function toBatchSurvivalResponse(batch: BatchSurvival): BatchSurvivalResponse {
  return { batchId: batch.batchId, speciesId: batch.speciesId, survivalRate: batch.survivalRate };
}

export function toPondFcrResponse(result: PondFcrResult): PondFcrResponse {
  return {
    pondId: result.pondId,
    totalFeedKg: result.totalFeedKg,
    biomassGainKg: result.biomassGainKg,
    fcr: result.fcr,
    batches: result.batches.map(toBatchSurvivalResponse),
  };
}
