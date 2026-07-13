import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent, DomainEventHandler } from '@fish-farm/shared';

/** Central retry policy (MOD-01 edge case 7): immediate in-process retries, then log and drop. */
const MAX_ATTEMPTS = 3;

/**
 * In-process domain event bus (TASK-006, FT-007, ADR-015). Modules publish past-tense events;
 * other modules subscribe — no direct cross-module service calls, no external broker.
 *
 * Failure isolation (AC-013): every handler runs try/caught with up to {@link MAX_ATTEMPTS}
 * attempts; a handler that still fails is logged (with the event id for follow-up) and dropped.
 * `publish` itself never rejects, so a failing subscriber can never crash the publishing
 * request — and one subscriber's failure never starves another's delivery.
 *
 * `publish` awaits all handlers: within a state-changing request the audit interceptor's
 * transaction is still bound to `TransactionContext`, so subscribers that write through a
 * `ScopedRepository` join the same transaction as the publisher.
 */
@Injectable()
export class DomainEventBus {
  private readonly logger = new Logger(DomainEventBus.name);
  private readonly handlers = new Map<string, Set<DomainEventHandler>>();

  /** Registers a handler for an event name; returns an unsubscribe function. */
  subscribe<E extends DomainEvent>(eventName: string, handler: DomainEventHandler<E>): () => void {
    const set = this.handlers.get(eventName) ?? new Set<DomainEventHandler>();
    set.add(handler as DomainEventHandler);
    this.handlers.set(eventName, set);
    return () => {
      set.delete(handler as DomainEventHandler);
    };
  }

  /** Dispatches to every subscriber of `event.name`. Never rejects (AC-013). */
  async publish(event: DomainEvent): Promise<void> {
    const subscribers = this.handlers.get(event.name);
    if (!subscribers || subscribers.size === 0) return;

    for (const handler of subscribers) {
      await this.dispatchWithRetry(handler, event);
    }
  }

  private async dispatchWithRetry(handler: DomainEventHandler, event: DomainEvent): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await handler(event);
        return;
      } catch (error) {
        const cause = error instanceof Error ? error : new Error(String(error));
        if (attempt === MAX_ATTEMPTS) {
          this.logger.error(
            `Subscriber failed for ${event.name} (eventId=${event.eventId}) after ${MAX_ATTEMPTS} attempts: ${cause.message}`,
            cause.stack,
          );
          return; // dropped after retries — never crashes the publisher (AC-013)
        }
        this.logger.warn(
          `Subscriber failed for ${event.name} (eventId=${event.eventId}), attempt ${attempt}/${MAX_ATTEMPTS}: ${cause.message}`,
        );
      }
    }
  }
}
