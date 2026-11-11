import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import { SpeciesRepositoryPort } from '../../ponds/application/ports/species-repository.port';
import { Batch } from '../../ponds/domain/batch.entity';
import { Species } from '../../ponds/domain/species.entity';
import { ProjectRepositoryPort } from '../../projects/application/ports/project-repository.port';
import { Project } from '../../projects/domain/project.entity';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { InventoryItem } from '../../inventory/domain/inventory-item.entity';
import { InventoryItemRepositoryPort } from '../../inventory/application/ports/inventory-item-repository.port';
import { InventoryTxnRepositoryPort } from '../../inventory/application/ports/inventory-txn-repository.port';
import { FeedTypeMismatchError } from '../domain/feed-errors';
import { FeedingLog } from '../domain/feeding-log.entity';
import { FeedingLogRepositoryPort } from './ports/feeding-log-repository.port';
import { LogFeedingUseCase } from './log-feeding.usecase';

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

const carp = Species.reconstitute({
  id: 'sp-carp',
  name: 'Carp',
  category: 'FISH',
  defaultDensityMin: null,
  defaultDensityMax: null,
});

const batch = Batch.reconstitute({
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
});

function makeItem(overrides: Partial<Parameters<typeof InventoryItem.reconstitute>[0]> = {}): InventoryItem {
  return InventoryItem.reconstitute({
    id: 'item-1',
    projectId: 'p-1',
    name: 'Floating pellets',
    feedType: 'FLOATING',
    unit: 'kg',
    quantity: 100,
    lowStockThreshold: 10,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });
}

function setup(
  overrides: {
    project?: Project | null;
    batch?: Batch | null;
    item?: InventoryItem | null;
    allSpecies?: Species[];
    existingLog?: FeedingLog | null;
  } = {},
) {
  const projects: jest.Mocked<ProjectRepositoryPort> = {
    findByIds: jest.fn().mockResolvedValue([]),
    findAllActive: jest.fn(),
    findById: jest
      .fn()
      .mockResolvedValue(overrides.project === undefined ? project : overrides.project),
    findPage: jest.fn(),
    save: jest.fn(),
  };
  const batches: jest.Mocked<BatchRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.batch === undefined ? batch : overrides.batch),
    save: jest.fn(),
  };
  const species: jest.Mocked<SpeciesRepositoryPort> = {
    findAll: jest.fn().mockResolvedValue(overrides.allSpecies ?? [carp]),
  };
  const items: jest.Mocked<InventoryItemRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.item === undefined ? makeItem() : overrides.item),
    save: jest.fn().mockImplementation((item: InventoryItem) => Promise.resolve(item)),
  };
  const txns: jest.Mocked<InventoryTxnRepositoryPort> = {
    findAllForItem: jest.fn(),
    save: jest.fn().mockImplementation((txn) => Promise.resolve(txn)),
  };
  const feedingLogs: jest.Mocked<FeedingLogRepositoryPort> = {
    findForProjectBetween: jest.fn().mockResolvedValue([]),
    findByClientMutationId: jest.fn().mockResolvedValue(overrides.existingLog ?? null),
    save: jest.fn().mockImplementation((log: FeedingLog) => Promise.resolve(log)),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as DomainEventBus;
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'WORKER' } });

  const useCase = new LogFeedingUseCase(projects, batches, species, items, txns, feedingLogs, events, tenant);
  return { useCase, projects, batches, species, items, txns, feedingLogs, events };
}

describe('LogFeedingUseCase (TASK-022, CON-018, F5/F6, AC-074/075/077, R4/R5/R9)', () => {
  it('AC-074: atomically decrements the matching inventory item and records the deduction as a transaction', async () => {
    const { useCase, items, txns } = setup();
    const log = await useCase.execute('batch-1', {
      inventoryItemId: 'item-1',
      qtyKg: 5,
      fedAt: new Date('2026-01-10'),
      clientMutationId: 'cm-1',
    });

    expect(log.qtyKg).toBe(5);
    expect(items.save).toHaveBeenCalledWith(expect.objectContaining({ quantity: 95 }));
    expect(txns.save).toHaveBeenCalledWith(expect.objectContaining({ delta: -5, reason: 'FEEDING' }));
  });

  it('AC-075/R4: rejects a feeding logged against a mismatched feed-type item', async () => {
    const { useCase } = setup({ item: makeItem({ feedType: 'SINKING' }) });
    await expect(
      useCase.execute('batch-1', {
        inventoryItemId: 'item-1',
        qtyKg: 5,
        fedAt: new Date(),
        clientMutationId: 'cm-2',
      }),
    ).rejects.toBeInstanceOf(FeedTypeMismatchError);
  });

  it('R4: a null item.feedType (generic/unclassified item) is never mismatched', async () => {
    const { useCase } = setup({ item: makeItem({ feedType: null }) });
    const log = await useCase.execute('batch-1', {
      inventoryItemId: 'item-1',
      qtyKg: 5,
      fedAt: new Date(),
      clientMutationId: 'cm-3',
    });
    expect(log.qtyKg).toBe(5);
  });

  it('AC-077/F6: stores the check-tray observation', async () => {
    const { useCase } = setup();
    const log = await useCase.execute('batch-1', {
      inventoryItemId: 'item-1',
      qtyKg: 5,
      fedAt: new Date(),
      observation: 'LEFTOVER',
      clientMutationId: 'cm-4',
    });
    expect(log.observation).toBe('LEFTOVER');
  });

  it('R5/edge case 6: over-deduction is never blocked — the feeding is recorded and the resulting negative quantity is the surfaced discrepancy', async () => {
    const { useCase, items } = setup({ item: makeItem({ quantity: 3, lowStockThreshold: null }) });
    const log = await useCase.execute('batch-1', {
      inventoryItemId: 'item-1',
      qtyKg: 5,
      fedAt: new Date(),
      clientMutationId: 'cm-5',
    });
    expect(log.qtyKg).toBe(5);
    expect(items.save).toHaveBeenCalledWith(expect.objectContaining({ quantity: -2 }));
  });

  it('R6: a deduction crossing the low-stock threshold emits LowStock exactly once', async () => {
    const { useCase, events } = setup({ item: makeItem({ quantity: 12, lowStockThreshold: 10 }) });
    await useCase.execute('batch-1', {
      inventoryItemId: 'item-1',
      qtyKg: 5,
      fedAt: new Date(),
      clientMutationId: 'cm-6',
    });
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'LowStock', sourceRef: 'item-1' }),
    );
    // FeedingLogged is also published — LowStock must be exactly one of the two calls.
    expect(events.publish).toHaveBeenCalledTimes(2);
  });

  it('staying below the threshold across a further deduction does not re-fire LowStock', async () => {
    const { useCase, events } = setup({ item: makeItem({ quantity: 8, lowStockThreshold: 10 }) });
    await useCase.execute('batch-1', {
      inventoryItemId: 'item-1',
      qtyKg: 2,
      fedAt: new Date(),
      clientMutationId: 'cm-7',
    });
    expect(events.publish).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'LowStock' }));
  });

  it('publishes FeedingLogged for FCR consumption', async () => {
    const { useCase, events } = setup();
    await useCase.execute('batch-1', {
      inventoryItemId: 'item-1',
      qtyKg: 5,
      fedAt: new Date('2026-01-10'),
      clientMutationId: 'cm-8',
    });
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'FeedingLogged', batchId: 'batch-1', qtyKg: 5 }),
    );
  });

  it('ADR-010: a replayed clientMutationId returns the existing log without double-deducting', async () => {
    const existing = FeedingLog.reconstitute({
      id: 'log-1',
      projectId: 'p-1',
      batchId: 'batch-1',
      inventoryItemId: 'item-1',
      qtyKg: 5,
      observation: null,
      fedAt: new Date(),
      clientMutationId: 'cm-9',
      createdAt: new Date(),
    });
    const { useCase, items, events } = setup({ existingLog: existing });
    const result = await useCase.execute('batch-1', {
      inventoryItemId: 'item-1',
      qtyKg: 5,
      fedAt: new Date(),
      clientMutationId: 'cm-9',
    });
    expect(result).toBe(existing);
    expect(items.save).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('a batch from another project (or unknown) is not found', async () => {
    const { useCase } = setup({ batch: null });
    await expect(
      useCase.execute('batch-elsewhere', {
        inventoryItemId: 'item-1',
        qtyKg: 5,
        fedAt: new Date(),
        clientMutationId: 'cm-10',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('an unknown inventory item is not found', async () => {
    const { useCase } = setup({ item: null });
    await expect(
      useCase.execute('batch-1', {
        inventoryItemId: 'item-elsewhere',
        qtyKg: 5,
        fedAt: new Date(),
        clientMutationId: 'cm-11',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('R9: logging a feeding on a CLOSED project returns PROJECT_CLOSED', async () => {
    const closedProject = Project.reconstitute({ ...activeProjectProps, status: 'CLOSED' });
    const { useCase } = setup({ project: closedProject });
    await expect(
      useCase.execute('batch-1', {
        inventoryItemId: 'item-1',
        qtyKg: 5,
        fedAt: new Date(),
        clientMutationId: 'cm-12',
      }),
    ).rejects.toBeInstanceOf(ProjectClosedError);
  });

  it('rejects a non-positive qtyKg', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute('batch-1', {
        inventoryItemId: 'item-1',
        qtyKg: 0,
        fedAt: new Date(),
        clientMutationId: 'cm-13',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
