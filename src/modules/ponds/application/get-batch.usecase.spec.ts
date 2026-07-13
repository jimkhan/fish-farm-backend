import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { Batch } from '../domain/batch.entity';
import { GetBatchUseCase } from './get-batch.usecase';
import { BatchRepositoryPort } from './ports/batch-repository.port';

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

function setup(overrides: { batch?: Batch | null } = {}) {
  const batches: jest.Mocked<BatchRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.batch === undefined ? batch : overrides.batch),
    save: jest.fn(),
  };
  return { useCase: new GetBatchUseCase(batches), batches };
}

describe('GetBatchUseCase (TASK-019, CON-017)', () => {
  it('returns the tenant-scoped batch (findById is scoped, so cross-project ids naturally 404)', async () => {
    const { useCase, batches } = setup();
    const result = await useCase.execute('b-1');
    expect(result).toBe(batch);
    expect(batches.findById).toHaveBeenCalledWith('b-1');
  });

  it('an unknown or cross-project batch throws NotFoundError', async () => {
    const { useCase } = setup({ batch: null });
    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});
