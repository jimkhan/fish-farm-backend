import { DomainEvent, DomainEventHandler } from '@fish-farm/shared';

/**
 * Wraps a handler so each `eventId` is processed at most once by this process (TASK-006
 * technical note; ADR-015 — read-model maintainers must be idempotent). Guards against
 * in-process redelivery (e.g. the bus's own retries succeeding after a partial effect).
 *
 * The seen-set is in-memory and bounded (FIFO eviction), so this protects a process lifetime —
 * durable idempotency (offline sync replay, cached Batch counters) additionally relies on the
 * natural keys the schema already carries (`client_mutation_id`, `dedup_key`).
 */
export function idempotentConsumer<E extends DomainEvent>(
  handler: DomainEventHandler<E>,
  options: { capacity?: number } = {},
): DomainEventHandler<E> {
  const capacity = options.capacity ?? 10_000;
  const seen = new Set<string>();

  return async (event: E): Promise<void> => {
    if (seen.has(event.eventId)) return;

    await handler(event);

    // Mark only after success so a failed (and later retried) handling is not skipped.
    seen.add(event.eventId);
    if (seen.size > capacity) {
      const oldest = seen.values().next().value;
      if (oldest !== undefined) seen.delete(oldest);
    }
  };
}
