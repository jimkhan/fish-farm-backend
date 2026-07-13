import { Sampling } from '../../domain/sampling.entity';

/** Tenant-scoped (ADR-006). */
export interface SamplingRepositoryPort {
  /** Every sampling for `batchId`, ordered by `sampledOn` ascending (oldest first). */
  findForBatch(batchId: string): Promise<Sampling[]>;
  findByClientMutationId(clientMutationId: string): Promise<Sampling | null>;
  save(sampling: Sampling): Promise<Sampling>;
}

export const SAMPLING_REPOSITORY = 'SamplingRepositoryPort';
