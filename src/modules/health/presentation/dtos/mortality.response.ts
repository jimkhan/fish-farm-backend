import { Mortality } from '../../domain/mortality.entity';

/** Wire shape of the `Mortality` schema (contracts/openapi.yaml, CON-019). */
export interface MortalityResponse {
  id: string;
  projectId: string;
  batchId: string;
  count: number;
  causeCategory: string;
  photoUrl: string | null;
  occurredAt: string;
}

export function toMortalityResponse(mortality: Mortality): MortalityResponse {
  return {
    id: mortality.id,
    projectId: mortality.projectId,
    batchId: mortality.batchId,
    count: mortality.count,
    causeCategory: mortality.causeCategory,
    photoUrl: mortality.photoUrl,
    occurredAt: mortality.occurredAt.toISOString(),
  };
}
