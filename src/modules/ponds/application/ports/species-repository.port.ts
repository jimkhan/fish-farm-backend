import { Species } from '../../domain/species.entity';

/** Not project-owned — global reference data (R8). */
export interface SpeciesRepositoryPort {
  findAll(): Promise<Species[]>;
}

export const SPECIES_REPOSITORY = 'SpeciesRepositoryPort';
