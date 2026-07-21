import { Mortality } from '../../domain/mortality.entity';

/** Tenant-scoped (ADR-006), same shape as `BatchRepositoryPort`/`StockingRepositoryPort`. */
export interface MortalityRepositoryPort {
  /** ADR-010 idempotent create — a replayed offline mutation resolves to the existing row. */
  findByClientMutationId(clientMutationId: string): Promise<Mortality | null>;
  /** Every record for `batchId` with `occurredAt` in `[fromInclusive, toExclusive)`. */
  findForBatchBetween(batchId: string, fromInclusive: Date, toExclusive: Date): Promise<Mortality[]>;
  /** TASK-037: every record across every batch in the project with `occurredAt` in
   * `[fromInclusive, toExclusive)` — the daily summary needs the whole project's mortalities
   * for a date, not one batch's. */
  findForProjectBetween(fromInclusive: Date, toExclusive: Date): Promise<Mortality[]>;
  save(mortality: Mortality): Promise<Mortality>;
}

export const MORTALITY_REPOSITORY = 'MortalityRepositoryPort';
