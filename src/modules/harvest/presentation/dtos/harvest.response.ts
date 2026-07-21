import { RecordHarvestResult } from '../../application/record-harvest.usecase';

/** Wire shape of the `Harvest` schema (contracts/openapi.yaml, CON-021). */
export interface HarvestResponse {
  id: string;
  projectId: string;
  batchId: string;
  quantity: number;
  totalWeightKg: number;
  grade: string;
  harvestedOn: string;
  revenue: { amountMinor: number; currency: 'BDT' } | null;
  withdrawalWarning: boolean;
}

export function toHarvestResponse(result: RecordHarvestResult): HarvestResponse {
  const { harvest, withdrawalWarning } = result;
  return {
    id: harvest.id,
    projectId: harvest.projectId,
    batchId: harvest.batchId,
    quantity: harvest.quantity,
    totalWeightKg: harvest.totalWeightKg,
    grade: harvest.grade,
    harvestedOn: harvest.harvestedOn.toISOString().slice(0, 10),
    revenue: harvest.revenueMinor === null ? null : { amountMinor: harvest.revenueMinor, currency: 'BDT' },
    withdrawalWarning,
  };
}
