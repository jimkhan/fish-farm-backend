import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import { Batch } from '../../ponds/domain/batch.entity';
import { ProjectRepositoryPort } from '../../projects/application/ports/project-repository.port';
import { Project } from '../../projects/domain/project.entity';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { TreatmentRepositoryPort } from '../../health/application/ports/treatment-repository.port';
import { Treatment } from '../../health/domain/treatment.entity';
import { Harvest } from '../domain/harvest.entity';
import { HarvestExceedsStockError } from '../domain/harvest-errors';
import { HarvestRepositoryPort } from './ports/harvest-repository.port';
import { RecordHarvestUseCase } from './record-harvest.usecase';

const activeProjectProps = {
  id: 'p-1',
  name: 'Farm',
  siteLat: 23.8,
  siteLng: 90.4,
  address: null,
  currency: 'BDT' as const,
  landUnit: 'BIGHA' as const,
  status: 'ACTIVE' as const,
  createdAt: new Date(),
};
const project = Project.reconstitute(activeProjectProps);

function makeBatch(overrides: Partial<Parameters<typeof Batch.reconstitute>[0]> = {}): Batch {
  return Batch.reconstitute({
    id: 'batch-1',
    projectId: 'p-1',
    pondId: 'pond-1',
    stockingId: 'stocking-1',
    speciesId: 'sp-1',
    initialCount: 1000,
    cumulativeMortality: 50,
    harvestedCount: 0,
    latestAvgWeightG: 100,
    status: 'ACTIVE',
    stockedOn: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });
}

function makeTreatment(overrides: Partial<Parameters<typeof Treatment.reconstitute>[0]> = {}): Treatment {
  return Treatment.reconstitute({
    id: 't-1',
    projectId: 'p-1',
    batchId: 'batch-1',
    product: 'Oxytetracycline',
    dose: '10mg/kg',
    administeredOn: new Date('2026-01-10'),
    withdrawalDays: 14,
    createdAt: new Date('2026-01-10'),
    ...overrides,
  });
}

function setup(
  overrides: {
    project?: Project | null;
    batch?: Batch | null;
    treatments?: Treatment[];
    existingHarvest?: Harvest | null;
  } = {},
) {
  const batches: jest.Mocked<BatchRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.batch === undefined ? makeBatch() : overrides.batch),
    save: jest.fn(),
  };
  const projects: jest.Mocked<ProjectRepositoryPort> = {
    findAllActive: jest.fn(),
    findById: jest
      .fn()
      .mockResolvedValue(overrides.project === undefined ? project : overrides.project),
    findPage: jest.fn(),
    save: jest.fn(),
  };
  const treatments: jest.Mocked<TreatmentRepositoryPort> = {
    findAllForBatch: jest.fn().mockResolvedValue(overrides.treatments ?? []),
    save: jest.fn(),
  };
  const harvests: jest.Mocked<HarvestRepositoryPort> = {
    findAllInCurrentProject: jest.fn().mockResolvedValue([]),
    findByClientMutationId: jest.fn().mockResolvedValue(overrides.existingHarvest ?? null),
    save: jest.fn().mockImplementation((h: Harvest) => Promise.resolve(h)),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as DomainEventBus;
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'WORKER' } });

  const useCase = new RecordHarvestUseCase(batches, projects, treatments, harvests, events, tenant);
  return { useCase, batches, projects, treatments, harvests, events };
}

describe('RecordHarvestUseCase (TASK-031, CON-021, F7, AC-102/103/106, R7/R8/R9)', () => {
  it('AC-102: records the harvest and publishes HarvestRecorded with the harvested count', async () => {
    const { useCase, events } = setup();
    const result = await useCase.execute('batch-1', {
      quantity: 100,
      totalWeightKg: 250,
      grade: 'LOCAL',
      harvestedOn: new Date('2026-02-01'),
      clientMutationId: 'cm-1',
    });

    expect(result.harvest.quantity).toBe(100);
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'HarvestRecorded', batchId: 'batch-1', count: 100 }),
    );
  });

  it('AC-106: revenue, when provided, is stored as integer minor units and emits HarvestRevenueEarned', async () => {
    const { useCase, events } = setup();
    const result = await useCase.execute('batch-1', {
      quantity: 100,
      totalWeightKg: 250,
      grade: 'LOCAL',
      harvestedOn: new Date('2026-02-01'),
      revenueMinor: 500000,
      clientMutationId: 'cm-2',
    });

    expect(result.harvest.revenueMinor).toBe(500000);
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'HarvestRevenueEarned', projectId: 'p-1', batchId: 'batch-1', revenueMinor: 500000 }),
    );
  });

  it('no revenue provided — stored as null, no HarvestRevenueEarned event', async () => {
    const { useCase, events } = setup();
    const result = await useCase.execute('batch-1', {
      quantity: 100,
      totalWeightKg: 250,
      grade: 'LOCAL',
      harvestedOn: new Date('2026-02-01'),
      clientMutationId: 'cm-3',
    });

    expect(result.harvest.revenueMinor).toBeNull();
    expect(events.publish).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'HarvestRevenueEarned' }));
  });

  it('AC-103/R8: a quantity exceeding survivalEstimate is rejected', async () => {
    const { useCase, events } = setup({ batch: makeBatch({ initialCount: 1000, cumulativeMortality: 950 }) });
    // survivalEstimate = 50
    await expect(
      useCase.execute('batch-1', {
        quantity: 51,
        totalWeightKg: 100,
        grade: 'LOCAL',
        harvestedOn: new Date('2026-02-01'),
        clientMutationId: 'cm-4',
      }),
    ).rejects.toBeInstanceOf(HarvestExceedsStockError);
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('a quantity exactly equal to survivalEstimate is accepted (boundary)', async () => {
    const { useCase } = setup({ batch: makeBatch({ initialCount: 1000, cumulativeMortality: 950 }) });
    const result = await useCase.execute('batch-1', {
      quantity: 50,
      totalWeightKg: 100,
      grade: 'LOCAL',
      harvestedOn: new Date('2026-02-01'),
      clientMutationId: 'cm-5',
    });
    expect(result.harvest.quantity).toBe(50);
  });

  it('R7/AC-101: an EXPORT harvest inside a withdrawal window is not blocked but is flagged', async () => {
    const { useCase } = setup({
      treatments: [makeTreatment({ administeredOn: new Date('2026-01-10'), withdrawalDays: 14 })],
    });
    const result = await useCase.execute('batch-1', {
      quantity: 10,
      totalWeightKg: 20,
      grade: 'EXPORT',
      harvestedOn: new Date('2026-01-15'), // inside [Jan 10, Jan 24)
      clientMutationId: 'cm-6',
    });
    expect(result.withdrawalWarning).toBe(true);
    expect(result.harvest.quantity).toBe(10);
  });

  it('R7: a LOCAL harvest inside the same withdrawal window is never flagged', async () => {
    const { useCase } = setup({
      treatments: [makeTreatment({ administeredOn: new Date('2026-01-10'), withdrawalDays: 14 })],
    });
    const result = await useCase.execute('batch-1', {
      quantity: 10,
      totalWeightKg: 20,
      grade: 'LOCAL',
      harvestedOn: new Date('2026-01-15'),
      clientMutationId: 'cm-7',
    });
    expect(result.withdrawalWarning).toBe(false);
  });

  it('R7: an EXPORT harvest after the withdrawal window closes is not flagged', async () => {
    const { useCase } = setup({
      treatments: [makeTreatment({ administeredOn: new Date('2026-01-10'), withdrawalDays: 14 })],
    });
    const result = await useCase.execute('batch-1', {
      quantity: 10,
      totalWeightKg: 20,
      grade: 'EXPORT',
      harvestedOn: new Date('2026-02-01'), // after Jan 24
      clientMutationId: 'cm-8',
    });
    expect(result.withdrawalWarning).toBe(false);
  });

  it('ADR-010: a replayed clientMutationId returns the existing harvest without re-checking stock or re-publishing', async () => {
    const existing = Harvest.reconstitute({
      id: 'h-1',
      projectId: 'p-1',
      batchId: 'batch-1',
      quantity: 999999, // would have exceeded stock had it been re-validated
      totalWeightKg: 10,
      grade: 'LOCAL',
      harvestedOn: new Date('2026-02-01'),
      revenueMinor: null,
      clientMutationId: 'cm-9',
      createdAt: new Date(),
    });
    const { useCase, events, harvests } = setup({ existingHarvest: existing });
    const result = await useCase.execute('batch-1', {
      quantity: 999999,
      totalWeightKg: 10,
      grade: 'LOCAL',
      harvestedOn: new Date('2026-02-01'),
      clientMutationId: 'cm-9',
    });

    expect(result.harvest).toBe(existing);
    expect(events.publish).not.toHaveBeenCalled();
    expect(harvests.save).not.toHaveBeenCalled();
  });

  it('a batch from another project (or unknown) is not found', async () => {
    const { useCase } = setup({ batch: null });
    await expect(
      useCase.execute('batch-elsewhere', {
        quantity: 10,
        totalWeightKg: 20,
        grade: 'LOCAL',
        harvestedOn: new Date(),
        clientMutationId: 'cm-10',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('the project must exist', async () => {
    const { useCase } = setup({ project: null });
    await expect(
      useCase.execute('batch-1', {
        quantity: 10,
        totalWeightKg: 20,
        grade: 'LOCAL',
        harvestedOn: new Date(),
        clientMutationId: 'cm-11',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('R9: harvesting on a CLOSED project returns PROJECT_CLOSED', async () => {
    const closedProject = Project.reconstitute({ ...activeProjectProps, status: 'CLOSED' });
    const { useCase } = setup({ project: closedProject });
    await expect(
      useCase.execute('batch-1', {
        quantity: 10,
        totalWeightKg: 20,
        grade: 'LOCAL',
        harvestedOn: new Date(),
        clientMutationId: 'cm-12',
      }),
    ).rejects.toBeInstanceOf(ProjectClosedError);
  });

  it('rejects a non-positive quantity or weight', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute('batch-1', {
        quantity: 0,
        totalWeightKg: 20,
        grade: 'LOCAL',
        harvestedOn: new Date(),
        clientMutationId: 'cm-13',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      useCase.execute('batch-1', {
        quantity: 10,
        totalWeightKg: 0,
        grade: 'LOCAL',
        harvestedOn: new Date(),
        clientMutationId: 'cm-14',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
