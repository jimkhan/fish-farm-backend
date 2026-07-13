import { Batch } from '../domain/batch.entity';
import { BiomassOverviewUseCase } from './biomass-overview.usecase';
import { BatchRepositoryPort } from './ports/batch-repository.port';

function batchFixture(overrides: Partial<Parameters<typeof Batch.reconstitute>[0]> = {}) {
  return Batch.reconstitute({
    id: 'b-1',
    projectId: 'p-1',
    pondId: 'pond-1',
    stockingId: 's-1',
    speciesId: 'species-1',
    initialCount: 1000,
    cumulativeMortality: 0,
    harvestedCount: 0,
    latestAvgWeightG: 20,
    status: 'ACTIVE',
    stockedOn: new Date(),
    createdAt: new Date(),
    ...overrides,
  });
}

describe('BiomassOverviewUseCase (TASK-019, CON-043, AC-066)', () => {
  it('aggregates biomass across all batches in the current project', async () => {
    const batches: jest.Mocked<BatchRepositoryPort> = {
      findAllInCurrentProject: jest.fn().mockResolvedValue([batchFixture()]),
      findById: jest.fn(),
      save: jest.fn(),
    };

    const useCase = new BiomassOverviewUseCase(batches);
    const result = await useCase.execute();

    expect(result.totalKg).toBe((1000 * 20) / 1000);
    expect(result.perSpecies).toEqual([{ speciesId: 'species-1', biomassKg: 20, survivalRate: 1 }]);
  });

  it('an empty project has zero total biomass', async () => {
    const batches: jest.Mocked<BatchRepositoryPort> = {
      findAllInCurrentProject: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      save: jest.fn(),
    };

    const useCase = new BiomassOverviewUseCase(batches);
    const result = await useCase.execute();

    expect(result.totalKg).toBe(0);
    expect(result.perSpecies).toEqual([]);
  });
});
