import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { InventoryItem } from '../domain/inventory-item.entity';
import { InventoryTxn } from '../domain/inventory-txn.entity';
import { ReconcileInventoryUseCase } from './reconcile-inventory.usecase';
import { InventoryItemRepositoryPort } from './ports/inventory-item-repository.port';
import { InventoryTxnRepositoryPort } from './ports/inventory-txn-repository.port';

function item(quantity: number) {
  return InventoryItem.reconstitute({
    id: 'i-1',
    projectId: 'p-1',
    name: 'Pellets',
    feedType: 'FLOATING',
    unit: 'kg',
    quantity,
    lowStockThreshold: 20,
    createdAt: new Date(),
  });
}

function txn(delta: number) {
  return InventoryTxn.reconstitute({
    id: `t-${delta}`,
    projectId: 'p-1',
    itemId: 'i-1',
    delta,
    reason: 'x',
    costMinor: null,
    occurredAt: new Date(),
  });
}

function setup(overrides: { item?: InventoryItem | null; txns?: InventoryTxn[] } = {}) {
  const items: jest.Mocked<InventoryItemRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.item === undefined ? item(70) : overrides.item),
    save: jest.fn(),
  };
  const txns: jest.Mocked<InventoryTxnRepositoryPort> = {
    findAllForItem: jest.fn().mockResolvedValue(overrides.txns ?? [txn(100), txn(-30)]),
    save: jest.fn(),
  };
  const useCase = new ReconcileInventoryUseCase(items, txns);
  return { useCase, items, txns };
}

describe('ReconcileInventoryUseCase (TASK-020, F9, AC-080)', () => {
  it('matches when cached quantity equals the sum of all transaction deltas', async () => {
    const { useCase } = setup({ item: item(70), txns: [txn(100), txn(-30)] });
    const result = await useCase.execute('i-1');
    expect(result.sumOfTransactions).toBe(70);
    expect(result.matches).toBe(true);
  });

  it('flags a mismatch between the cached quantity and the ledger', async () => {
    const { useCase } = setup({ item: item(999), txns: [txn(100), txn(-30)] });
    const result = await useCase.execute('i-1');
    expect(result.sumOfTransactions).toBe(70);
    expect(result.matches).toBe(false);
  });

  it('an unknown item is not found', async () => {
    const { useCase } = setup({ item: null });
    await expect(useCase.execute('i-elsewhere')).rejects.toBeInstanceOf(NotFoundError);
  });
});
