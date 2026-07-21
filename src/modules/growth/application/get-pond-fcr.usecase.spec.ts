import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import { Batch } from '../../ponds/domain/batch.entity';
import { PondRepositoryPort } from '../../ponds/application/ports/pond-repository.port';
import { Pond } from '../../ponds/domain/pond.entity';
import { HarvestRepositoryPort } from '../../harvest/application/ports/harvest-repository.port';
import { Harvest } from '../../harvest/domain/harvest.entity';
import { Sampling } from '../domain/sampling.entity';
import { GetPondFcrUseCase } from './get-pond-fcr.usecase';
import { PondFeedAccumulatorRepositoryPort } from './ports/pond-feed-accumulator-repository.port';
import { SamplingRepositoryPort } from './ports/sampling-repository.port';

const pond = Pond.reconstitute({
  id: 'pond-1',
  projectId: 'p-1',
  name: 'North Pond',
  area: 10,
  depthM: null,
  notes: null,
  createdAt: new Date(),
});

function makeBatch(overrides: Partial<Parameters<typeof Batch.reconstitute>[0]> = {}): Batch {
  return Batch.reconstitute({
    id: 'batch-1',
    projectId: 'p-1',
    pondId: 'pond-1',
    stockingId: 'stocking-1',
    speciesId: 'sp-1',
    initialCount: 1000,
    cumulativeMortality: 100,
    harvestedCount: 0,
    latestAvgWeightG: 150,
    status: 'ACTIVE',
    stockedOn: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });
}

function sampling(avgWeightG: number, sampledOn: string): Sampling {
  return Sampling.reconstitute({
    id: `s-${avgWeightG}`,
    projectId: 'p-1',
    batchId: 'batch-1',
    sampleSize: 30,
    avgWeightG,
    sampledOn: new Date(sampledOn),
    clientMutationId: `cm-${avgWeightG}`,
    createdAt: new Date(sampledOn),
  });
}

function harvest(batchId: string, totalWeightKg: number): Harvest {
  return Harvest.reconstitute({
    id: `h-${batchId}-${totalWeightKg}`,
    projectId: 'p-1',
    batchId,
    quantity: 100,
    totalWeightKg,
    grade: 'LOCAL',
    harvestedOn: new Date('2026-03-01'),
    revenueMinor: null,
    clientMutationId: `cm-h-${batchId}-${totalWeightKg}`,
    createdAt: new Date('2026-03-01'),
  });
}

function setup(
  overrides: {
    pond?: Pond | null;
    batches?: Batch[];
    samplingsByBatch?: Record<string, Sampling[]>;
    harvests?: Harvest[];
    totalFeedKg?: number;
  } = {},
) {
  const ponds: jest.Mocked<PondRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.pond === undefined ? pond : overrides.pond),
    save: jest.fn(),
  };
  const batches: jest.Mocked<BatchRepositoryPort> = {
    findAllInCurrentProject: jest.fn().mockResolvedValue(overrides.batches ?? [makeBatch()]),
    findById: jest.fn(),
    save: jest.fn(),
  };
  const samplingsByBatch = overrides.samplingsByBatch ?? {};
  const samplings: jest.Mocked<SamplingRepositoryPort> = {
    findForBatch: jest.fn().mockImplementation((batchId: string) => Promise.resolve(samplingsByBatch[batchId] ?? [])),
    findByClientMutationId: jest.fn(),
    save: jest.fn(),
  };
  const harvests: jest.Mocked<HarvestRepositoryPort> = {
    findAllInCurrentProject: jest.fn().mockResolvedValue(overrides.harvests ?? []),
    findByClientMutationId: jest.fn(),
    save: jest.fn(),
  };
  const accumulator: jest.Mocked<PondFeedAccumulatorRepositoryPort> = {
    findTotalFeedKgForPond: jest.fn().mockResolvedValue(overrides.totalFeedKg ?? 0),
  };

  const useCase = new GetPondFcrUseCase(ponds, batches, samplings, harvests, accumulator);
  return { useCase, ponds, batches, samplings, harvests, accumulator };
}

describe('GetPondFcrUseCase (TASK-030, CON-058, R3/R4, AC-098/099)', () => {
  it('AC-099: reports survival rate per batch = survivalEstimate ÷ initialCount', async () => {
    const { useCase } = setup({ batches: [makeBatch({ initialCount: 1000, cumulativeMortality: 200 })] });
    const result = await useCase.execute('pond-1');
    expect(result.batches).toEqual([{ batchId: 'batch-1', speciesId: 'sp-1', survivalRate: 0.8 }]);
  });

  it('AC-098: FCR = pond feed ÷ summed biomass gain (incl. harvested weight)', async () => {
    const { useCase } = setup({
      batches: [makeBatch({ initialCount: 1000, cumulativeMortality: 100, latestAvgWeightG: 150 })],
      samplingsByBatch: { 'batch-1': [sampling(50, '2026-01-15'), sampling(150, '2026-02-15')] },
      harvests: [harvest('batch-1', 10)],
      totalFeedKg: 100,
    });
    // survivalEstimate = 900; gain = 900*(150-50)/1000 + 10 = 90 + 10 = 100kg; FCR = 100/100 = 1
    const result = await useCase.execute('pond-1');
    expect(result.biomassGainKg).toBe(100);
    expect(result.fcr).toBe(1);
  });

  it('edge case 2: a batch with fewer than 2 samplings contributes nothing to gain, never fabricated', async () => {
    const { useCase } = setup({
      batches: [makeBatch()],
      samplingsByBatch: { 'batch-1': [sampling(50, '2026-01-15')] },
      totalFeedKg: 100,
    });
    const result = await useCase.execute('pond-1');
    expect(result.biomassGainKg).toBeNull();
    expect(result.fcr).toBeNull();
  });

  it('sums gain across multiple batches sharing a pond (polyculture) for one pond-level FCR', async () => {
    const batchA = makeBatch({ id: 'batch-a', initialCount: 1000, cumulativeMortality: 0, latestAvgWeightG: 100 });
    const batchB = makeBatch({ id: 'batch-b', initialCount: 500, cumulativeMortality: 0, latestAvgWeightG: 60 });
    const { useCase } = setup({
      batches: [batchA, batchB],
      samplingsByBatch: {
        'batch-a': [
          Sampling.reconstitute({ id: 's-a1', projectId: 'p-1', batchId: 'batch-a', sampleSize: 30, avgWeightG: 50, sampledOn: new Date('2026-01-01'), clientMutationId: 'cm-a1', createdAt: new Date() }),
          Sampling.reconstitute({ id: 's-a2', projectId: 'p-1', batchId: 'batch-a', sampleSize: 30, avgWeightG: 100, sampledOn: new Date('2026-02-01'), clientMutationId: 'cm-a2', createdAt: new Date() }),
        ],
        'batch-b': [
          Sampling.reconstitute({ id: 's-b1', projectId: 'p-1', batchId: 'batch-b', sampleSize: 30, avgWeightG: 20, sampledOn: new Date('2026-01-01'), clientMutationId: 'cm-b1', createdAt: new Date() }),
          Sampling.reconstitute({ id: 's-b2', projectId: 'p-1', batchId: 'batch-b', sampleSize: 30, avgWeightG: 60, sampledOn: new Date('2026-02-01'), clientMutationId: 'cm-b2', createdAt: new Date() }),
        ],
      },
      totalFeedKg: 90,
    });
    // batch-a gain: 1000*(100-50)/1000 = 50kg; batch-b gain: 500*(60-20)/1000 = 20kg; total = 70kg
    const result = await useCase.execute('pond-1');
    expect(result.biomassGainKg).toBe(70);
    expect(result.fcr).toBeCloseTo(90 / 70);
    expect(result.batches).toHaveLength(2);
  });

  it('a pond from another project (or unknown) is not found', async () => {
    const { useCase } = setup({ pond: null });
    await expect(useCase.execute('pond-elsewhere')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a pond with no batches returns zero feed, null gain/FCR, and an empty batch list', async () => {
    const { useCase } = setup({ batches: [], totalFeedKg: 0 });
    const result = await useCase.execute('pond-1');
    expect(result).toEqual({
      pondId: 'pond-1',
      totalFeedKg: 0,
      biomassGainKg: null,
      fcr: null,
      batches: [],
    });
  });
});
