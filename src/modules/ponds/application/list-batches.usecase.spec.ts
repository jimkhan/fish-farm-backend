import { Batch } from '../domain/batch.entity';
import { ListBatchesUseCase } from './list-batches.usecase';
import { BatchRepositoryPort } from './ports/batch-repository.port';

describe('ListBatchesUseCase (TASK-019, CON-016)', () => {
  it("returns the current project's batches", async () => {
    const batch = Batch.reconstitute({
      id: 'b-1',
      projectId: 'p-1',
      pondId: 'pond-1',
      stockingId: 's-1',
      speciesId: 'species-1',
      initialCount: 1000,
      cumulativeMortality: 0,
      harvestedCount: 0,
      latestAvgWeightG: null,
      status: 'ACTIVE',
      stockedOn: new Date(),
      createdAt: new Date(),
    });
    const batches: jest.Mocked<BatchRepositoryPort> = {
      findAllInCurrentProject: jest.fn().mockResolvedValue([batch]),
      findById: jest.fn(),
      save: jest.fn(),
    };

    const useCase = new ListBatchesUseCase(batches);
    const result = await useCase.execute();

    expect(result).toEqual([batch]);
  });
});
