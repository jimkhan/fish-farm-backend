import { Controller, Get } from '@nestjs/common';
import { ListSpeciesUseCase } from '../application/list-species.usecase';
import { Species } from '../domain/species.entity';

/** Wire shape of the `Species` schema (contracts/openapi.yaml). */
interface SpeciesResponse {
  id: string;
  name: string;
  category: string;
  defaultDensityMin: number | null;
  defaultDensityMax: number | null;
}

function toResponse(species: Species): SpeciesResponse {
  return {
    id: species.id,
    name: species.name,
    category: species.category,
    defaultDensityMin: species.defaultDensityMin,
    defaultDensityMax: species.defaultDensityMax,
  };
}

/** `GET /species` (CON-048). Not project-scoped — a shared, seeded reference list. */
@Controller('species')
export class SpeciesController {
  constructor(private readonly listSpecies: ListSpeciesUseCase) {}

  @Get()
  async listHandler(): Promise<SpeciesResponse[]> {
    const species = await this.listSpecies.execute();
    return species.map(toResponse);
  }
}
