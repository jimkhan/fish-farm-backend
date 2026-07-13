import { DomainEvent } from './domain-event';

/**
 * MOD-05 events (TASK-022, ADR-015). Emitted on every feeding log (F5, AC-074). MOD-07's FCR
 * calculation (TASK-030, module doc §1 "consumed for FCR") is this event's eventual consumer —
 * not yet built — so MOD-05 defines the contract it needs as the first (and currently only)
 * publisher, per ADR-015; MOD-07 subscribes against this shape when it lands.
 */
export interface FeedingLogged extends DomainEvent {
  readonly name: 'FeedingLogged';
  readonly projectId: string;
  readonly batchId: string;
  readonly qtyKg: number;
  readonly fedAt: Date;
}
