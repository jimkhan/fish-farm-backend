import { Batch } from '../../domain/batch.entity';

/**
 * Unscoped, by explicit `batchId` (TASK-019). Used only by the mortality/sampling/harvest event
 * handlers, which run on `DomainEventBus` delivery — not inside an HTTP request — so there is
 * structurally no `TenantContext` to scope through (same exception class as
 * `MembershipDirectoryPort`/`MembershipResolverPort`, MOD-01 §4.6).
 */
export interface BatchEventRepositoryPort {
  findById(batchId: string): Promise<Batch | null>;
  /**
   * TASK-021: every batch that still has stock in a pond, across every project —
   * `FeedingReminderScheduler` groups these by (project, feed type).
   *
   * That means `ACTIVE` **and** `HARVESTING`: a partially-harvested batch still has fish in the
   * water and still needs feeding. Only `CLOSED` — nothing left, all dead or all harvested —
   * drops out. Named for the question it answers rather than for a status value, because the
   * previous `findAllActive()` invited exactly the off-by-one-status mistake.
   */
  findWithStockInPond(): Promise<Batch[]>;
  save(batch: Batch): Promise<Batch>;
}

export const BATCH_EVENT_REPOSITORY = 'BatchEventRepositoryPort';
