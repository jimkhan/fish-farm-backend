import { GrowthResult } from '../../application/get-growth.usecase';
import { SamplingResponse, toSamplingResponse } from './sampling.response';

/** Wire shape of `GET .../growth` (CON-052, ADG/SGR only — FCR is TASK-030). */
export interface GrowthResponse {
  batchId: string;
  speciesId: string;
  samplings: SamplingResponse[];
  adgGPerDay: number | null;
  sgrPercentPerDay: number | null;
  growthAnomaly: boolean;
}

export function toGrowthResponse(result: GrowthResult): GrowthResponse {
  return {
    batchId: result.batchId,
    speciesId: result.speciesId,
    samplings: result.samplings.map(toSamplingResponse),
    adgGPerDay: result.adgGPerDay,
    sgrPercentPerDay: result.sgrPercentPerDay,
    growthAnomaly: result.growthAnomaly,
  };
}
