import { DomainEvent } from './domain-event';

/**
 * MOD-03 project lifecycle events (TASK-011, ADR-015). Published on `DomainEventBus`; no
 * subscriber exists yet.
 */
export interface ProjectCreated extends DomainEvent {
  readonly name: 'ProjectCreated';
  readonly ownerId: string;
}

export interface ProjectClosed extends DomainEvent {
  readonly name: 'ProjectClosed';
}
