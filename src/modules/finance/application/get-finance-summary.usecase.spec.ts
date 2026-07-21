import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import { Batch } from '../../ponds/domain/batch.entity';
import { SpeciesRepositoryPort } from '../../ponds/application/ports/species-repository.port';
import { Species } from '../../ponds/domain/species.entity';
import { FinancialTxn } from '../domain/financial-txn.entity';
import { FinancialTxnRepositoryPort } from './ports/financial-txn-repository.port';
import { GetFinanceSummaryUseCase } from './get-finance-summary.usecase';

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

function txn(kind: 'COST' | 'REVENUE', amountMinor: number): FinancialTxn {
  return FinancialTxn.reconstitute({
    id: `t-${Math.random()}`,
    projectId: 'p-1',
    kind,
    category: kind === 'REVENUE' ? 'HARVEST' : 'FEED',
    amountMinor,
    occurredOn: new Date(),
    sourceRef: null,
    note: null,
    createdAt: new Date(),
  });
}

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
    latestAvgWeightG: 100,
    status: 'ACTIVE',
    stockedOn: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });
}

function setup(
  overrides: {
    txns?: FinancialTxn[];
    batches?: Batch[];
    allSpecies?: Species[];
  } = {},
) {
  const txns: jest.Mocked<FinancialTxnRepositoryPort> = {
    findAllInCurrentProject: jest.fn().mockResolvedValue(overrides.txns ?? []),
    save: jest.fn(),
  };
  const batches: jest.Mocked<BatchRepositoryPort> = {
    findAllInCurrentProject: jest.fn().mockResolvedValue(overrides.batches ?? []),
    findById: jest.fn(),
    save: jest.fn(),
  };
  const species: jest.Mocked<SpeciesRepositoryPort> = {
    findAll: jest.fn().mockResolvedValue(overrides.allSpecies ?? [carp, golda]),
  };

  const useCase = new GetFinanceSummaryUseCase(txns, batches, species);
  return { useCase, txns, batches, species };
}

describe('GetFinanceSummaryUseCase (TASK-033, CON-034, F2/F3, AC-110/111)', () => {
  it('AC-111: net profit = Σrevenue − Σcost', async () => {
    const { useCase } = setup({
      txns: [txn('REVENUE', 800000), txn('COST', 200000), txn('COST', 100000)],
    });
    const result = await useCase.execute();
    expect(result.totalRevenueMinor).toBe(800000);
    expect(result.totalCostMinor).toBe(300000);
    expect(result.netProfitMinor).toBe(500000);
  });

  it('AC-110: remaining harvest value sums remaining biomass × the assumed-grade market rate', async () => {
    // Carp (FISH): survival 1000 × 100g = 100,000g = 100kg × 25,000 minor/kg = 2,500,000
    const { useCase } = setup({ batches: [makeBatch()] });
    const result = await useCase.execute();
    expect(result.remainingHarvestValueMinor).toBe(2_500_000);
  });

  it('AC-110: PRAWN batches use the EXPORT rate', async () => {
    const { useCase } = setup({
      batches: [makeBatch({ speciesId: 'sp-golda', initialCount: 500, latestAvgWeightG: 50 })],
    });
    // 500 × 50g = 25,000g = 25kg × 80,000 minor/kg = 2,000,000
    const result = await useCase.execute();
    expect(result.remainingHarvestValueMinor).toBe(2_000_000);
  });

  it('a batch with no sampling yet contributes zero remaining value, never fabricated', async () => {
    const { useCase } = setup({ batches: [makeBatch({ latestAvgWeightG: null })] });
    const result = await useCase.execute();
    expect(result.remainingHarvestValueMinor).toBe(0);
  });

  it('AC-111: projectedRoiPct = (netProfit + remainingHarvestValue) / totalCost × 100', async () => {
    const { useCase } = setup({
      txns: [txn('REVENUE', 300000), txn('COST', 200000)],
      batches: [makeBatch()], // remainingHarvestValueMinor = 2,500,000
    });
    // netProfit = 100,000; (100,000 + 2,500,000) / 200,000 × 100 = 1300
    const result = await useCase.execute();
    expect(result.projectedRoiPct).toBeCloseTo(1300);
  });

  it('projectedRoiPct is 0 (never Infinity/NaN) when totalCost is zero', async () => {
    const { useCase } = setup({ txns: [txn('REVENUE', 100000)] });
    const result = await useCase.execute();
    expect(result.projectedRoiPct).toBe(0);
  });

  it('an unknown species referenced by a batch is not silently guessed', async () => {
    const { useCase } = setup({ batches: [makeBatch({ speciesId: 'sp-unknown' })], allSpecies: [] });
    await expect(useCase.execute()).rejects.toBeInstanceOf(NotFoundError);
  });
});
