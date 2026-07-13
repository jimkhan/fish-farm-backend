import { Stocking } from '../../domain/stocking.entity';

/** Tenant-scoped (ADR-006). */
export interface StockingRepositoryPort {
  save(stocking: Stocking): Promise<Stocking>;
}

export const STOCKING_REPOSITORY = 'StockingRepositoryPort';
