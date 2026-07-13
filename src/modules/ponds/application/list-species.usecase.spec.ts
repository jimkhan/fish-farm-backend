import { Species } from '../domain/species.entity';
import { ListSpeciesUseCase } from './list-species.usecase';
import { SpeciesRepositoryPort } from './ports/species-repository.port';

describe('ListSpeciesUseCase (TASK-018, CON-048)', () => {
  it('returns all seeded species', async () => {
    const golda = Species.reconstitute({
      id: 's-1',
      name: 'SPF Golda',
      category: 'PRAWN',
      defaultDensityMin: null,
      defaultDensityMax: null,
    });
    const species: jest.Mocked<SpeciesRepositoryPort> = {
      findAll: jest.fn().mockResolvedValue([golda]),
    };

    const useCase = new ListSpeciesUseCase(species);
    const result = await useCase.execute();

    expect(result).toEqual([golda]);
  });
});
