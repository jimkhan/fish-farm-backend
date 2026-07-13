import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import { SpeciesRepositoryPort } from '../../ponds/application/ports/species-repository.port';
import { Batch } from '../../ponds/domain/batch.entity';
import { Species } from '../../ponds/domain/species.entity';
import { WaterReadingRepositoryPort } from '../../water/application/ports/water-reading-repository.port';
import { WaterThresholdRepositoryPort } from '../../water/application/ports/water-threshold-repository.port';
import { WaterReading } from '../../water/domain/water-reading.entity';
import { WaterThreshold } from '../../water/domain/water-threshold.entity';
import { SamplingRequiredError } from '../domain/feed-errors';
import { GetFeedPlanUseCase } from './get-feed-plan.usecase';

const carp = Species.reconstitute({
  id: 'sp-carp',
  name: 'Carp',
  category: 'FISH',
  defaultDensityMin: null,
  defaultDensityMax: null,
});
const golda = Species.reconstitute({
  id: 'sp-golda',
  name: 'SPF Golda',
  category: 'PRAWN',
  defaultDensityMin: null,
  defaultDensityMax: null,
});

function makeBatch(overrides: Partial<Parameters<typeof Batch.reconstitute>[0]> = {}): Batch {
  return Batch.reconstitute({
    id: 'batch-1',
    projectId: 'p-1',
    pondId: 'pond-1',
    stockingId: 'stocking-1',
    speciesId: 'sp-carp',
    initialCount: 1000,
    cumulativeMortality: 0,
    harvestedCount: 0,
    latestAvgWeightG: 50,
    status: 'ACTIVE',
    stockedOn: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });
}

function makeReading(parameter: 'DO' | 'TEMP', value: number, readAt: Date): WaterReading {
  return WaterReading.reconstitute({
    id: `r-${parameter}-${value}`,
    projectId: 'p-1',
    pondId: 'pond-1',
    parameter,
    value,
    source: 'MANUAL',
    deviceId: null,
    readAt,
    clientMutationId: `cm-${parameter}-${value}`,
    createdAt: readAt,
  });
}

function setup(
  overrides: {
    batch?: Batch | null;
    allSpecies?: Species[];
    readings?: WaterReading[];
    doThreshold?: WaterThreshold | null;
    tempThreshold?: WaterThreshold | null;
  } = {},
) {
  const batches: jest.Mocked<BatchRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.batch === undefined ? makeBatch() : overrides.batch),
    save: jest.fn(),
  };
  const species: jest.Mocked<SpeciesRepositoryPort> = {
    findAll: jest.fn().mockResolvedValue(overrides.allSpecies ?? [carp, golda]),
  };
  const readings: jest.Mocked<WaterReadingRepositoryPort> = {
    findForPond: jest.fn().mockImplementation((_pondId: string, parameter?: string) =>
      Promise.resolve((overrides.readings ?? []).filter((r) => r.parameter === parameter)),
    ),
    findByClientMutationId: jest.fn(),
    save: jest.fn(),
  };
  const thresholds: jest.Mocked<WaterThresholdRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findByParameter: jest.fn().mockImplementation((parameter: string) =>
      Promise.resolve(parameter === 'DO' ? (overrides.doThreshold ?? null) : (overrides.tempThreshold ?? null)),
    ),
    save: jest.fn(),
  };

  const useCase = new GetFeedPlanUseCase(batches, species, readings, thresholds);
  return { useCase, batches, species, readings, thresholds };
}

describe('GetFeedPlanUseCase (TASK-021, CON-018a, AC-071/072/073)', () => {
  it('AC-071: computes the quota and splits it into one line for the batch feed type (FISH → FLOATING)', async () => {
    const { useCase } = setup();
    const plan = await useCase.execute('batch-1');

    expect(plan.batchId).toBe('batch-1');
    expect(plan.totalKg).toBeCloseTo(2.5);
    expect(plan.adjustedForTempDo).toBe(false);
    expect(plan.adjustmentReason).toBeNull();
    expect(plan.lines).toEqual([{ feedType: 'FLOATING', kg: expect.closeTo(2.5) }]);
  });

  it('F3: a PRAWN batch splits into a SINKING line', async () => {
    const { useCase } = setup({ batch: makeBatch({ speciesId: 'sp-golda' }) });
    const plan = await useCase.execute('batch-1');
    expect(plan.lines[0].feedType).toBe('SINKING');
  });

  it('AC-072/R2: SAMPLING_REQUIRED when the batch has never been sampled', async () => {
    const { useCase } = setup({ batch: makeBatch({ latestAvgWeightG: null }) });
    await expect(useCase.execute('batch-1')).rejects.toBeInstanceOf(SamplingRequiredError);
  });

  it('a batch from another project (or unknown) is not found', async () => {
    const { useCase } = setup({ batch: null });
    await expect(useCase.execute('batch-elsewhere')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('AC-073: adjusts using the latest DO/TEMP readings and the effective (seeded default) thresholds', async () => {
    const { useCase } = setup({
      readings: [
        makeReading('DO', 5, new Date('2026-01-10T06:00:00Z')),
        makeReading('DO', 2, new Date('2026-01-10T08:00:00Z')), // latest — below critical (3)
        makeReading('TEMP', 28, new Date('2026-01-10T08:00:00Z')),
      ],
    });
    const plan = await useCase.execute('batch-1');

    expect(plan.adjustedForTempDo).toBe(true);
    expect(plan.totalKg).toBe(0);
    expect(plan.adjustmentReason).toMatch(/dissolved oxygen/i);
    expect(plan.lines[0].kg).toBe(0);
  });

  it('a project-configured threshold overrides the seeded default', async () => {
    const { useCase } = setup({
      readings: [makeReading('TEMP', 33, new Date('2026-01-10T08:00:00Z'))],
      tempThreshold: WaterThreshold.reconstitute({
        id: 't-1',
        projectId: 'p-1',
        parameter: 'TEMP',
        min: 20,
        max: 40,
        critical: null,
      }),
    });
    const plan = await useCase.execute('batch-1');

    // 33°C is within the widened [20,40] override, so no adjustment fires.
    expect(plan.adjustedForTempDo).toBe(false);
  });
});
