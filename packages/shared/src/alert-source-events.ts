import { DomainEvent } from './domain-event';

/**
 * Consumed by MOD-09 to raise alerts (TASK-015). MOD-05 (inventory)/MOD-06 (water)/MOD-07
 * (health)/MOD-12 (tasks) are these events' eventual publishers — none built yet — so MOD-09
 * defines the contracts it needs as the first (and currently only) consumer, per ADR-015 (same
 * pattern as TASK-019's `MortalityRecorded`/etc.). Every source event's `projectId` (narrowed to
 * required here — alerts are always project-scoped, R1) and `sourceRef` (what specifically
 * triggered it — a pond, item, task, batch id) together with its `type` form the alert's dedup
 * key (R5).
 */
export interface WaterThresholdBreached extends DomainEvent {
  readonly name: 'WaterThresholdBreached';
  readonly projectId: string;
  readonly sourceRef: string;
  /** A breach can be routine or severe (R3) — the source decides, the alert engine just relays it. */
  readonly severity: 'WARNING' | 'CRITICAL';
  readonly message: string;
}

/** Always CRITICAL (R3) — no severity field, the alert engine hardcodes it. */
export interface WaterEmergencyRaised extends DomainEvent {
  readonly name: 'WaterEmergencyRaised';
  readonly projectId: string;
  readonly sourceRef: string;
  readonly message: string;
}

export interface LowStock extends DomainEvent {
  readonly name: 'LowStock';
  readonly projectId: string;
  readonly sourceRef: string;
  readonly message: string;
}

export interface MissedTask extends DomainEvent {
  readonly name: 'MissedTask';
  readonly projectId: string;
  readonly sourceRef: string;
  readonly message: string;
}

export interface AbnormalMortalityDetected extends DomainEvent {
  readonly name: 'AbnormalMortalityDetected';
  readonly projectId: string;
  readonly sourceRef: string;
  readonly message: string;
}
