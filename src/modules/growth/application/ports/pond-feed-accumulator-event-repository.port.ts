/**
 * Unscoped, by explicit `projectId`/`pondId` (TASK-030). Used only by `OnFeedingLoggedHandler`,
 * which runs on `DomainEventBus` delivery — not inside an HTTP request — so there is structurally
 * no `TenantContext` to scope through (same exception class as `BatchEventRepositoryPort`).
 */
export interface PondFeedAccumulatorEventRepositoryPort {
  /** Upserts: creates the row at `deltaKg` if none exists yet, otherwise adds to it. */
  incrementFeedKg(projectId: string, pondId: string, deltaKg: number): Promise<void>;
}

export const POND_FEED_ACCUMULATOR_EVENT_REPOSITORY = 'PondFeedAccumulatorEventRepositoryPort';
