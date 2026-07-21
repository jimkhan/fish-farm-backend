import { SyncMutation } from '../../domain/sync-mutation.entity';

/**
 * Unscoped (global, not project-owned — same structural exception as `DeviceTokenRepositoryPort`/
 * `RefreshTokenRepositoryPort`): a `clientMutationId` is minted offline (ADR-016) before project
 * membership is even resolved for that specific mutation, so there is no single `TenantContext`
 * to scope this lookup through. `save()` upserts by `clientMutationId` (the ERD's own primary
 * key) — a retried `FAILED` mutation's row is overwritten with the new attempt's outcome.
 */
export interface SyncMutationRepositoryPort {
  findByClientMutationId(clientMutationId: string): Promise<SyncMutation | null>;
  save(mutation: SyncMutation): Promise<SyncMutation>;
}

export const SYNC_MUTATION_REPOSITORY = 'SyncMutationRepositoryPort';
