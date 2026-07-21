import { DomainEvent } from './domain-event';

/**
 * MOD-04 events (TASK-018/019, ADR-015). `stockingCostMinor` (TASK-032 addition): MOD-08's
 * finance ingestion (R3 — "StockingRecorded → a STOCKING cost") needs the cost amount to auto-
 * record a transaction; the event never carried it before since it had no consumer that needed
 * it. Optional/undefined when a stocking is recorded with no cost (nothing to ingest then).
 * `projectId` is narrowed to required here (the base `DomainEvent.projectId` is optional) — MOD-08's
 * ingestion handler needs it guaranteed present to construct a `FinancialTxn`, and
 * `RecordStockingUseCase` always sets it (`this.tenant.projectId`) in practice.
 */
export interface StockingRecorded extends DomainEvent {
  readonly name: 'StockingRecorded';
  readonly projectId: string;
  readonly stockingId: string;
  readonly batchId: string;
  readonly pondId: string;
  readonly speciesId: string;
  readonly stockingCostMinor?: number;
}

export interface BatchCreated extends DomainEvent {
  readonly name: 'BatchCreated';
  readonly batchId: string;
  readonly pondId: string;
  readonly speciesId: string;
  readonly initialCount: number;
}

/**
 * Consumed by MOD-04 to maintain the survival/biomass read-model (TASK-019). MOD-07 (health/
 * growth/harvest) is this event's eventual publisher — not yet built — so MOD-04 defines the
 * contract it needs as the first (and currently only) consumer, per ADR-015 ("event contracts
 * live in packages/shared"); MOD-07 implements against this shape when it lands. Each carries
 * only what MOD-04's read-model needs, not MOD-07's full internal record (cause, photo, grade…).
 */
export interface MortalityRecorded extends DomainEvent {
  readonly name: 'MortalityRecorded';
  readonly batchId: string;
  readonly count: number;
}

export interface SamplingRecorded extends DomainEvent {
  readonly name: 'SamplingRecorded';
  readonly batchId: string;
  readonly avgWeightG: number;
}

export interface HarvestRecorded extends DomainEvent {
  readonly name: 'HarvestRecorded';
  readonly batchId: string;
  readonly count: number;
}
