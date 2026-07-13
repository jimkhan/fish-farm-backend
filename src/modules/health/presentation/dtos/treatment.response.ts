import { Treatment } from '../../domain/treatment.entity';

/** Wire shape of the `Treatment` schema (contracts/openapi.yaml, CON-051). */
export interface TreatmentResponse {
  id: string;
  projectId: string;
  batchId: string;
  product: string;
  dose: string;
  administeredOn: string;
  withdrawalDays: number;
  exportSafeAfter: string;
}

export function toTreatmentResponse(treatment: Treatment): TreatmentResponse {
  return {
    id: treatment.id,
    projectId: treatment.projectId,
    batchId: treatment.batchId,
    product: treatment.product,
    dose: treatment.dose,
    administeredOn: treatment.administeredOn.toISOString().slice(0, 10),
    withdrawalDays: treatment.withdrawalDays,
    exportSafeAfter: treatment.exportSafeAfter.toISOString().slice(0, 10),
  };
}
