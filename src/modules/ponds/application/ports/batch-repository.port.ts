import { Batch } from '../../domain/batch.entity';

/**
 * Tenant-scoped (ADR-006) — for request-driven reads/writes (recording a stocking, listing/
 * getting batches within the caller's project). The mortality/sampling/harvest event handlers use
 * the separate `BatchEventRepositoryPort` instead — they run outside any HTTP request, so there
 * is no `TenantContext` for them to be scoped by (the same structural reason
 * `MembershipDirectoryPort` exists alongside the tenant-scoped `ProjectMembershipRepositoryPort`).
 */
export interface BatchRepositoryPort {
  findAllInCurrentProject(): Promise<Batch[]>;
  findById(batchId: string): Promise<Batch | null>;
  save(batch: Batch): Promise<Batch>;
}

export const BATCH_REPOSITORY = 'BatchRepositoryPort';
