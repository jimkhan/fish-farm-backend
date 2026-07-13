import { FeedingLog } from '../../domain/feeding-log.entity';

/** Tenant-scoped (ADR-006). */
export interface FeedingLogRepositoryPort {
  /** ADR-010 offline idempotency — a replayed mutation (online or via `POST /sync`) never duplicates. */
  findByClientMutationId(clientMutationId: string): Promise<FeedingLog | null>;
  save(log: FeedingLog): Promise<FeedingLog>;
}

export const FEEDING_LOG_REPOSITORY = 'FeedingLogRepositoryPort';
