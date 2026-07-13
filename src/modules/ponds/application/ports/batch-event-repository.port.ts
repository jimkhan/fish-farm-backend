import { Batch } from '../../domain/batch.entity';

/**
 * Unscoped, by explicit `batchId` (TASK-019). Used only by the mortality/sampling/harvest event
 * handlers, which run on `DomainEventBus` delivery — not inside an HTTP request — so there is
 * structurally no `TenantContext` to scope through (same exception class as
 * `MembershipDirectoryPort`/`MembershipResolverPort`, MOD-01 §4.6).
 */
export interface BatchEventRepositoryPort {
  findById(batchId: string): Promise<Batch | null>;
  /** TASK-021: every ACTIVE batch across every project — `FeedingReminderScheduler` groups these by (project, feed type). */
  findAllActive(): Promise<Batch[]>;
  save(batch: Batch): Promise<Batch>;
}

export const BATCH_EVENT_REPOSITORY = 'BatchEventRepositoryPort';
