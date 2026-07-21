import { DomainEvent } from './domain-event';

/**
 * MOD-08 event (TASK-032, ADR-015, R3 — "FeedCostIncurred (inventory receipt) → a FEED cost").
 * MOD-05's `RecordInventoryTxnUseCase` (TASK-020) is the publisher; MOD-08's finance ingestion is
 * the first (and currently only) consumer, so MOD-08 defines the contract it needs, same pattern
 * as every other cross-module event this session. Published only when a manual inventory
 * transaction is a receipt (`delta > 0`) carrying a cost — a plain stock adjustment with no cost
 * (or a deduction) has nothing for finance to ingest.
 */
export interface FeedCostIncurred extends DomainEvent {
  readonly name: 'FeedCostIncurred';
  readonly projectId: string;
  /** The originating `InventoryTxn.id` — MOD-08's idempotency key (`source_ref`). */
  readonly sourceRef: string;
  readonly costMinor: number;
}
