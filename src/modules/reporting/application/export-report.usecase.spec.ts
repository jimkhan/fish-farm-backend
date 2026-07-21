import { ForbiddenError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { ProjectRole } from '../../../shared-kernel/tenant/membership-resolver.port';
import { FinancialTxnRepositoryPort } from '../../finance/application/ports/financial-txn-repository.port';
import { GetFinanceSummaryUseCase } from '../../finance/application/get-finance-summary.usecase';
import { FinancialTxn } from '../../finance/domain/financial-txn.entity';
import { GetGrowthUseCase } from '../../growth/application/get-growth.usecase';
import { HarvestRepositoryPort } from '../../harvest/application/ports/harvest-repository.port';
import { Harvest } from '../../harvest/domain/harvest.entity';
import { BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import { Batch } from '../../ponds/domain/batch.entity';
import { ExportReportUseCase } from './export-report.usecase';

function makeBatch(): Batch {
  return Batch.reconstitute({
    id: 'batch-1',
    projectId: 'proj-1',
    pondId: 'pond-1',
    stockingId: 'stk-1',
    speciesId: 'species-golda',
    initialCount: 1000,
    cumulativeMortality: 10,
    harvestedCount: 0,
    latestAvgWeightG: 25,
    status: 'ACTIVE',
    stockedOn: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

function makeHarvest(): Harvest {
  return Harvest.reconstitute({
    id: 'harvest-1',
    projectId: 'proj-1',
    batchId: 'batch-1',
    quantity: 500,
    totalWeightKg: 120,
    grade: 'EXPORT',
    harvestedOn: new Date('2026-06-15T00:00:00.000Z'),
    revenueMinor: 900000,
    clientMutationId: 'cm-h1',
    createdAt: new Date('2026-06-15T00:00:00.000Z'),
  });
}

function makeTxn(): FinancialTxn {
  return FinancialTxn.reconstitute({
    id: 'txn-1',
    projectId: 'proj-1',
    kind: 'COST',
    category: 'FEED',
    amountMinor: 250000,
    occurredOn: new Date('2026-05-02T00:00:00.000Z'),
    sourceRef: null,
    note: 'Sinking pellets, 50kg',
    createdAt: new Date('2026-05-02T00:00:00.000Z'),
  });
}

describe('ExportReportUseCase (CON-046, AC-123/126)', () => {
  let tenant: { role: ProjectRole };
  let batches: jest.Mocked<BatchRepositoryPort>;
  let getGrowth: { execute: jest.Mock };
  let harvests: jest.Mocked<HarvestRepositoryPort>;
  let txns: jest.Mocked<FinancialTxnRepositoryPort>;
  let getFinanceSummary: { execute: jest.Mock };
  let useCase: ExportReportUseCase;

  beforeEach(() => {
    tenant = { role: 'OWNER' };
    batches = {
      findAllInCurrentProject: jest.fn().mockResolvedValue([makeBatch()]),
      findById: jest.fn(),
      save: jest.fn(),
    };
    getGrowth = {
      execute: jest.fn().mockResolvedValue({
        batchId: 'batch-1',
        speciesId: 'species-golda',
        samplings: [],
        adgGPerDay: 0.8,
        sgrPercentPerDay: 2.1,
        growthAnomaly: false,
      }),
    };
    harvests = {
      findAllInCurrentProject: jest.fn().mockResolvedValue([makeHarvest()]),
      findByClientMutationId: jest.fn(),
      save: jest.fn(),
    };
    txns = {
      findAllInCurrentProject: jest.fn().mockResolvedValue([makeTxn()]),
      save: jest.fn(),
    };
    getFinanceSummary = {
      execute: jest.fn().mockResolvedValue({
        totalCostMinor: 250000,
        totalRevenueMinor: 900000,
        netProfitMinor: 650000,
        remainingHarvestValueMinor: 0,
        projectedRoiPct: 260,
      }),
    };
    useCase = new ExportReportUseCase(
      tenant as unknown as TenantContext,
      batches,
      getGrowth as unknown as GetGrowthUseCase,
      harvests,
      txns,
      getFinanceSummary as unknown as GetFinanceSummaryUseCase,
    );
  });

  it('growth export: CSV with a batch row and a dual-rendered stocked-on date', async () => {
    const file = await useCase.execute('growth');
    expect(file.filename).toMatch(/^growth-report-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(file.content).toContain('Batch ID,Species ID,Stocked On');
    expect(file.content).toContain('batch-1');
    // dual date: Gregorian (Bangla in parens) — the comma inside forces quoting
    expect(file.content).toMatch(/"2026-01-01 \(.+\)"/);
  });

  it('harvest export: CSV with the harvest row', async () => {
    const file = await useCase.execute('harvest');
    expect(file.content).toContain('Harvest ID,Batch ID,Harvested On');
    expect(file.content).toContain('harvest-1');
    expect(file.content).toContain('EXPORT');
  });

  it('financial export: OWNER gets a ledger + summary block', async () => {
    const file = await useCase.execute('financial');
    expect(file.content).toContain('transaction');
    expect(file.content).toContain('"Sinking pellets, 50kg"'); // comma-quoted note
    expect(file.content).toContain('Net Profit (BDT minor units)');
    expect(file.content).toContain('650000');
  });

  it('financial export: PARTNER is allowed (read-only finance access)', async () => {
    tenant.role = 'PARTNER';
    await expect(useCase.execute('financial')).resolves.toBeDefined();
  });

  it('financial export: WORKER is denied (403)', async () => {
    tenant.role = 'WORKER';
    await expect(useCase.execute('financial')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('growth/harvest exports are allowed for a WORKER (any member)', async () => {
    tenant.role = 'WORKER';
    await expect(useCase.execute('growth')).resolves.toBeDefined();
    await expect(useCase.execute('harvest')).resolves.toBeDefined();
  });
});
