import { Sampling } from '../../domain/sampling.entity';

/** Wire shape of the `Sampling` schema (contracts/openapi.yaml, CON-020). */
export interface SamplingResponse {
  id: string;
  projectId: string;
  batchId: string;
  sampleSize: number;
  avgWeightG: number;
  sampledOn: string;
}

export function toSamplingResponse(sampling: Sampling): SamplingResponse {
  return {
    id: sampling.id,
    projectId: sampling.projectId,
    batchId: sampling.batchId,
    sampleSize: sampling.sampleSize,
    avgWeightG: sampling.avgWeightG,
    sampledOn: sampling.sampledOn.toISOString().slice(0, 10),
  };
}
