import { Inject, Injectable } from '@nestjs/common';
import { Species } from '../domain/species.entity';
import { SPECIES_REPOSITORY, SpeciesRepositoryPort } from './ports/species-repository.port';

/** `GET /species` (CON-048). Seeded reference data — not project-scoped, no auth requirement. */
@Injectable()
export class ListSpeciesUseCase {
  constructor(@Inject(SPECIES_REPOSITORY) private readonly species: SpeciesRepositoryPort) {}

  async execute(): Promise<Species[]> {
    return this.species.findAll();
  }
}
