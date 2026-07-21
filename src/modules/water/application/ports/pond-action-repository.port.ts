import { PondAction } from '../../domain/pond-action.entity';

/** Tenant-scoped (ADR-006). */
export interface PondActionRepositoryPort {
  findByClientMutationId(clientMutationId: string): Promise<PondAction | null>;
  save(action: PondAction): Promise<PondAction>;
}

export const POND_ACTION_REPOSITORY = 'PondActionRepositoryPort';
