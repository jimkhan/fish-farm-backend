import { Treatment } from '../../domain/treatment.entity';

/** Tenant-scoped (ADR-006). */
export interface TreatmentRepositoryPort {
  findAllForBatch(batchId: string): Promise<Treatment[]>;
  save(treatment: Treatment): Promise<Treatment>;
}

export const TREATMENT_REPOSITORY = 'TreatmentRepositoryPort';
