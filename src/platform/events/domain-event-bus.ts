import { Injectable, Logger, Optional } from '@nestjs/common';
import { DomainEvent, DomainEventHandler } from '@fish-farm/shared';
import { TransactionContext } from '../persistence/transaction-context';

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
 *
 * **Each attempt is wrapped in a savepoint** when a transaction is active. Sharing the
 * publisher's transaction means a handler that wrote a row and *then* threw leaves that write
 * visible — so a naive retry re-applied it, and a permanently-failed handler still committed
 * its partial effect alongside the publisher. Rolling back to a per-attempt savepoint makes
 * retries genuinely idempotent at the storage level and makes a dropped handler leave nothing
 * behind. Handlers remain responsible for their own logical idempotency (`dedup_key`,
 * `client_mutation_id`, {@link idempotentConsumer}) — this only removes the storage hazard the
 * bus itself introduced.
 */
@Injectable()
export class DomainEventBus {
  private readonly logger = new Logger(DomainEventBus.name);
  private readonly handlers = new Map<string, Set<DomainEventHandler>>();
  private savepointCounter = 0;

  constructor(
    // Optional: unit tests and any publish outside a request transaction run without one, in
    // which case there is no savepoint to take and handlers run exactly as before.
    @Optional() private readonly transactions?: TransactionContext,
  ) {}

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
        await this.runIsolated(handler, event);
        return;
      } catch (error) {
        const cause = error instanceof Error ? error : new Error(String(error));
        if (attempt === MAX_ATTEMPTS) {
          // Log the whole event, not just its id: this reaction is being abandoned while the
          // publisher's own write commits, so the payload here is the only remaining record of
          // what should have happened. A CRITICAL alert lost this way (FR-054/NFR-013) has to be
          // recoverable from the log until a durable outbox exists — see the follow-up note.
          this.logger.error(
            `Subscriber PERMANENTLY FAILED for ${event.name} (eventId=${event.eventId}) after ` +
              `${MAX_ATTEMPTS} attempts; the reaction is dropped while the publisher commits. ` +
              `Event: ${safeStringify(event)}. Cause: ${cause.message}`,
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

  /**
   * Runs one handler attempt inside a savepoint, so a failure undoes any partial write it made
   * before the next attempt (or before the event is dropped). Without an active transaction —
   * unit tests, background publishes — this is a plain call.
   */
  private async runIsolated(handler: DomainEventHandler, event: DomainEvent): Promise<void> {
    const queryRunner = this.transactions?.manager?.queryRunner;
    if (!queryRunner?.isTransactionActive) {
      await handler(event);
      return;
    }

    const savepoint = `ffms_evt_${++this.savepointCounter}`;
    await queryRunner.query(`SAVEPOINT ${savepoint}`);
    try {
      await handler(event);
      await queryRunner.query(`RELEASE SAVEPOINT ${savepoint}`);
    } catch (error) {
      await queryRunner.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      throw error;
    }
  }
}

/** Never let logging an event be the thing that throws (cyclic refs, exotic values). */
function safeStringify(event: DomainEvent): string {
  try {
    return JSON.stringify(event);
  } catch {
    return '<unserializable>';
  }
}
