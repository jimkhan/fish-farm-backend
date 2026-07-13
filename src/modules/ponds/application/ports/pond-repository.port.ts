import { Pond } from '../../domain/pond.entity';

/** Tenant-scoped (ADR-006) — every method operates within the current request's `TenantContext.projectId`. */
export interface PondRepositoryPort {
  findAllInCurrentProject(): Promise<Pond[]>;
  /** `null` if `pondId` doesn't exist or belongs to another project — never disclosed (edge case 1). */
  findById(pondId: string): Promise<Pond | null>;
  save(pond: Pond): Promise<Pond>;
}

export const POND_REPOSITORY = 'PondRepositoryPort';
