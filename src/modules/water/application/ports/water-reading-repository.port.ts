import { WaterReading } from '../../domain/water-reading.entity';

/** Tenant-scoped (ADR-006). */
export interface WaterReadingRepositoryPort {
  findForPond(pondId: string, parameter?: string): Promise<WaterReading[]>;
  /** TASK-026: one pond's readings for a single parameter within `[fromInclusive, toExclusive)` —
   * the trend-series query (CON-059). Ordering is the use-case's concern, not the repo's. */
  findForPondBetween(
    pondId: string,
    parameter: string,
    fromInclusive: Date,
    toExclusive: Date,
  ): Promise<WaterReading[]>;
  /** TASK-037: every reading across every pond in the project within `[fromInclusive,
   * toExclusive)` — the daily summary's water-status reduction needs the whole project's
   * readings for a date, not one pond's. */
  findForProjectBetween(fromInclusive: Date, toExclusive: Date): Promise<WaterReading[]>;
  findByClientMutationId(clientMutationId: string): Promise<WaterReading | null>;
  save(reading: WaterReading): Promise<WaterReading>;
}

export const WATER_READING_REPOSITORY = 'WaterReadingRepositoryPort';
