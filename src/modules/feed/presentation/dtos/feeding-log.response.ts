import { FeedingLog } from '../../domain/feeding-log.entity';

/** Wire shape of the `FeedingLog` schema (contracts/openapi.yaml, CON-018). */
export interface FeedingLogResponse {
  id: string;
  projectId: string;
  batchId: string;
  inventoryItemId: string;
  qtyKg: number;
  observation: string | null;
  fedAt: string;
}

export function toFeedingLogResponse(log: FeedingLog): FeedingLogResponse {
  return {
    id: log.id,
    projectId: log.projectId,
    batchId: log.batchId,
    inventoryItemId: log.inventoryItemId,
    qtyKg: log.qtyKg,
    observation: log.observation,
    fedAt: log.fedAt.toISOString(),
  };
}
