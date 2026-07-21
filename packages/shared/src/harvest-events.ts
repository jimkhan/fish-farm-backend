import { DomainEvent } from './domain-event';

/**
 * MOD-07 event (TASK-031, ADR-015). MOD-08's finance ingestion (TASK-032, "Delivers real-time
 * revenue... from harvests") is this event's eventual consumer — not yet built — so MOD-07
 * defines the contract it needs as the first publisher, same pattern as every other not-yet-
 * consumed event this session. Only published when a harvest actually carries revenue (it's
 * optional on `CreateHarvest` — a harvest can be recorded before its sale price is known).
 *
 * `harvestId` (TASK-032 addition): the original shape had no stable per-occurrence id — `batchId`
 * alone can't dedupe across multiple harvests on the same batch, and MOD-08's ingestion handler
 * (its actual first consumer) needs a unique `source_ref` to idempotently record exactly one
 * HARVEST revenue transaction per harvest, not per batch.
 */
export interface HarvestRevenueEarned extends DomainEvent {
  readonly name: 'HarvestRevenueEarned';
  readonly projectId: string;
  readonly batchId: string;
  readonly harvestId: string;
  readonly revenueMinor: number;
}
