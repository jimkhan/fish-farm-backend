import { Mortality } from '../../domain/mortality.entity';

/** Tenant-scoped (ADR-006), same shape as `BatchRepositoryPort`/`StockingRepositoryPort`. */
export interface MortalityRepositoryPort {
  /** ADR-010 idempotent create — a replayed offline mutation resolves to the existing row. */
  findByClientMutationId(clientMutationId: string): Promise<Mortality | null>;
  /** Every record for `batchId` with `occurredAt` in `[fromInclusive, toExclusive)`. */
  findForBatchBetween(batchId: string, fromInclusive: Date, toExclusive: Date): Promise<Mortality[]>;
  save(mortality: Mortality): Promise<Mortality>;
}

export const MORTALITY_REPOSITORY = 'MortalityRepositoryPort';
