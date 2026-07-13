import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import { Batch } from '../../ponds/domain/batch.entity';
import { Sampling } from '../domain/sampling.entity';
import { GetGrowthUseCase } from './get-growth.usecase';
import { SamplingRepositoryPort } from './ports/sampling-repository.port';

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
  stockedOn: new Date('2026-01-01'),
  createdAt: new Date(),
});

function sampling(avgWeightG: number, sampledOn: string) {
  return Sampling.reconstitute({
    id: `s-${sampledOn}`,
    projectId: 'p-1',
    batchId: 'b-1',
    sampleSize: 30,
    avgWeightG,
    sampledOn: new Date(sampledOn),
    clientMutationId: `cmid-${sampledOn}`,
    createdAt: new Date(),
  });
}

function setup(overrides: { batch?: Batch | null; samplings?: Sampling[] } = {}) {
  const samplings: jest.Mocked<SamplingRepositoryPort> = {
    findForBatch: jest.fn().mockResolvedValue(overrides.samplings ?? []),
    findByClientMutationId: jest.fn(),
    save: jest.fn(),
  };
  const batches: jest.Mocked<BatchRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.batch === undefined ? batch : overrides.batch),
    save: jest.fn(),
  };
  const useCase = new GetGrowthUseCase(samplings, batches);
  return { useCase, samplings, batches };
}

describe('GetGrowthUseCase (TASK-029, CON-052, AC-097, R5)', () => {
  it('AC-097: with >=2 samplings, returns ADG/SGR computed from the two most recent', async () => {
    const { useCase } = setup({
      samplings: [sampling(10, '2026-01-01'), sampling(15, '2026-01-06'), sampling(20, '2026-01-16')],
    });
    const result = await useCase.execute('b-1');
    // most recent pair: 2026-01-06 (15g) -> 2026-01-16 (20g), 10 days.
    expect(result.adgGPerDay).toBeCloseTo((20 - 15) / 10, 5);
    expect(result.growthAnomaly).toBe(false);
    expect(result.samplings).toHaveLength(3);
  });

  it('R5: fewer than 2 samplings returns null ADG/SGR, not a fabricated number', async () => {
    const { useCase } = setup({ samplings: [sampling(10, '2026-01-01')] });
    const result = await useCase.execute('b-1');
    expect(result.adgGPerDay).toBeNull();
    expect(result.sgrPercentPerDay).toBeNull();
    expect(result.growthAnomaly).toBe(false);
  });

  it('zero samplings also returns null, not an error', async () => {
    const { useCase } = setup({ samplings: [] });
    const result = await useCase.execute('b-1');
    expect(result.adgGPerDay).toBeNull();
    expect(result.samplings).toHaveLength(0);
  });

  it('edge case 5: a declining weight flags growthAnomaly true', async () => {
    const { useCase } = setup({
      samplings: [sampling(20, '2026-01-01'), sampling(15, '2026-01-06')],
    });
    const result = await useCase.execute('b-1');
    expect(result.adgGPerDay).toBeLessThan(0);
    expect(result.growthAnomaly).toBe(true);
  });

  it('a batch from another project (or unknown) is not found', async () => {
    const { useCase } = setup({ batch: null });
    await expect(useCase.execute('b-elsewhere')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('response includes the batch speciesId', async () => {
    const { useCase } = setup({ samplings: [] });
    const result = await useCase.execute('b-1');
    expect(result.speciesId).toBe('species-1');
  });
});
