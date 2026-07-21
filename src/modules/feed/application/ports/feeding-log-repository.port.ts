import { FeedingLog } from '../../domain/feeding-log.entity';

/** Tenant-scoped (ADR-006). */
export interface FeedingLogRepositoryPort {
  /** ADR-010 offline idempotency — a replayed mutation (online or via `POST /sync`) never duplicates. */
  findByClientMutationId(clientMutationId: string): Promise<FeedingLog | null>;
  /** TASK-037: every feeding log in the project with `fedAt` in `[fromInclusive, toExclusive)` —
   * the daily summary sums `qtyKg` across these for the requested date. */
  findForProjectBetween(fromInclusive: Date, toExclusive: Date): Promise<FeedingLog[]>;
  save(log: FeedingLog): Promise<FeedingLog>;
}

export const FEEDING_LOG_REPOSITORY = 'FeedingLogRepositoryPort';
