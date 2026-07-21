import { Harvest } from '../../domain/harvest.entity';

/** Tenant-scoped (ADR-006). */
export interface HarvestRepositoryPort {
  /** TASK-030: every harvest in the current project — `GetPondFcrUseCase` filters by `batchId` to
   * sum harvested biomass per pond (FCR's "gain" includes what's already been harvested). */
  findAllInCurrentProject(): Promise<Harvest[]>;
  findByClientMutationId(clientMutationId: string): Promise<Harvest | null>;
  save(harvest: Harvest): Promise<Harvest>;
}

export const HARVEST_REPOSITORY = 'HarvestRepositoryPort';
