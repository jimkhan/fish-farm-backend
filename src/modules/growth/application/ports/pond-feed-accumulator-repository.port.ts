/** Tenant-scoped (ADR-006) — for the FCR read query. */
export interface PondFeedAccumulatorRepositoryPort {
  /** Total accumulated feed (kg) for a pond. `0` if no feeding has ever been logged for it. */
  findTotalFeedKgForPond(pondId: string): Promise<number>;
}

export const POND_FEED_ACCUMULATOR_REPOSITORY = 'PondFeedAccumulatorRepositoryPort';
