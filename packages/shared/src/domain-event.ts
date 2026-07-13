/**
 * Base shape of a domain event (FT-007, ADR-015). Names are `PascalCase` past-tense
 * (`WaterThresholdBreached`, `FeedingLogged`, `MortalityRecorded`) — CLAUDE.md §5.
 *
 * Framework-free on purpose: domain layers construct events; every surface shares this
 * contract. Concrete event payloads are added here as their producing modules land.
 */
export interface DomainEvent {
  /** `PascalCase` past-tense event name, e.g. `MortalityRecorded`. */
  readonly name: string;
  /** Unique id of this occurrence — the consumer-side idempotency key (ADR-015). */
  readonly eventId: string;
  readonly occurredAt: Date;
  /** Set for project-owned events; absent for platform-level events. */
  readonly projectId?: string;
}

export type DomainEventHandler<E extends DomainEvent = DomainEvent> = (
  event: E,
) => void | Promise<void>;
