import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { ProjectRepositoryPort } from '../../projects/application/ports/project-repository.port';
import { Project } from '../../projects/domain/project.entity';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { InventoryItem } from '../domain/inventory-item.entity';
import { InventoryTxn } from '../domain/inventory-txn.entity';
import { RecordInventoryTxnUseCase } from './record-txn.usecase';
import { InventoryItemRepositoryPort } from './ports/inventory-item-repository.port';
import { InventoryTxnRepositoryPort } from './ports/inventory-txn-repository.port';

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

function item(overrides: Partial<Parameters<typeof InventoryItem.reconstitute>[0]> = {}) {
  return InventoryItem.reconstitute({
    id: 'i-1',
    projectId: 'p-1',
    name: 'Floating Pellets',
    feedType: 'FLOATING',
    unit: 'kg',
    quantity: 100,
    lowStockThreshold: 20,
    createdAt: new Date(),
    ...overrides,
  });
}

function setup(overrides: { project?: Project | null; item?: InventoryItem | null } = {}) {
  const items: jest.Mocked<InventoryItemRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.item === undefined ? item() : overrides.item),
    save: jest.fn().mockImplementation(async (i: InventoryItem) => i),
  };
  const txns: jest.Mocked<InventoryTxnRepositoryPort> = {
    findAllForItem: jest.fn(),
    save: jest.fn().mockImplementation(async (t: InventoryTxn) => t),
  };
  const projects: jest.Mocked<ProjectRepositoryPort> = {
    findByIds: jest.fn().mockResolvedValue([]),
    findAllActive: jest.fn(),
    findById: jest
      .fn()
      .mockResolvedValue(overrides.project === undefined ? project : overrides.project),
    findPage: jest.fn(),
    save: jest.fn(),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as DomainEventBus;
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'OWNER' } });

  const useCase = new RecordInventoryTxnUseCase(items, txns, projects, events, tenant);
  return { useCase, items, txns, projects, events };
}

describe('RecordInventoryTxnUseCase (TASK-020, CON-024, AC-079/080/082, R6/R7/R9)', () => {
  it('AC-074-analog: applies the delta atomically to the item quantity', async () => {
    const { useCase, items } = setup();
    await useCase.execute('i-1', { delta: -30, reason: 'feeding' });
    expect(items.save).toHaveBeenCalledWith(expect.objectContaining({ quantity: 70 }));
  });

  it('AC-082: persists the optional cost as integer minor units', async () => {
    const { useCase, txns } = setup();
    const txn = await useCase.execute('i-1', { delta: 500, reason: 'receipt', costMinor: 250000 });
    expect(txn.costMinor).toBe(250000);
    expect(txns.save).toHaveBeenCalledTimes(1);
  });

  it('a manual adjustment that would drive quantity negative is rejected', async () => {
    const { useCase, items, txns } = setup({ item: item({ quantity: 10 }) });
    await expect(useCase.execute('i-1', { delta: -50, reason: 'oops' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(txns.save).not.toHaveBeenCalled();
    expect(items.save).not.toHaveBeenCalled();
  });

  it('an item from another project (or unknown) is not found', async () => {
    const { useCase } = setup({ item: null });
    await expect(
      useCase.execute('i-elsewhere', { delta: 10, reason: 'receipt' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('R9: a CLOSED project rejects with PROJECT_CLOSED', async () => {
    const closedProject = Project.reconstitute({ ...activeProjectProps, status: 'CLOSED' });
    const { useCase } = setup({ project: closedProject });
    await expect(useCase.execute('i-1', { delta: 10, reason: 'receipt' })).rejects.toBeInstanceOf(
      ProjectClosedError,
    );
  });

  describe('R6/AC-079: LowStock single-fire on crossing', () => {
    it('emits LowStock when the delta crosses the threshold downward', async () => {
      const { useCase, events } = setup({ item: item({ quantity: 25, lowStockThreshold: 20 }) });
      await useCase.execute('i-1', { delta: -10, reason: 'feeding' }); // 25 -> 15, crosses 20
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'LowStock', projectId: 'p-1', sourceRef: 'i-1' }),
      );
    });

    it('does not re-emit when already below the threshold before this delta', async () => {
      const { useCase, events } = setup({ item: item({ quantity: 15, lowStockThreshold: 20 }) });
      await useCase.execute('i-1', { delta: -5, reason: 'feeding' }); // 15 -> 10, already below
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('does not emit when staying at/above the threshold', async () => {
      const { useCase, events } = setup({ item: item({ quantity: 100, lowStockThreshold: 20 }) });
      await useCase.execute('i-1', { delta: -10, reason: 'feeding' }); // 100 -> 90
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('does not emit when there is no configured threshold', async () => {
      const { useCase, events } = setup({ item: item({ quantity: 5, lowStockThreshold: null }) });
      await useCase.execute('i-1', { delta: -4, reason: 'feeding' });
      expect(events.publish).not.toHaveBeenCalled();
    });
  });
});
