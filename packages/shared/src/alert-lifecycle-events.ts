import { DomainEvent } from './domain-event';

/** MOD-09 events (TASK-015, ADR-015). Published on `DomainEventBus`; no subscriber yet. */
export interface AlertRaised extends DomainEvent {
  readonly name: 'AlertRaised';
  readonly projectId: string;
  readonly alertId: string;
  readonly alertType: 'WATER_THRESHOLD' | 'WATER_EMERGENCY' | 'LOW_STOCK' | 'MISSED_TASK' | 'ABNORMAL_MORTALITY';
  readonly severity: 'INFO' | 'WARNING' | 'CRITICAL';
}

export interface AlertAcknowledged extends DomainEvent {
  readonly name: 'AlertAcknowledged';
  readonly projectId: string;
  readonly alertId: string;
}
