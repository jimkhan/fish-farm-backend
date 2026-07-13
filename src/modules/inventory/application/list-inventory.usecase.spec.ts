import { InventoryItem } from '../domain/inventory-item.entity';
import { ListInventoryUseCase } from './list-inventory.usecase';
import { InventoryItemRepositoryPort } from './ports/inventory-item-repository.port';

describe('ListInventoryUseCase (TASK-020, CON-022, AC-078)', () => {
  it('returns every item in the current (scoped) project', async () => {
    const one = InventoryItem.reconstitute({
      id: 'i-1',
      projectId: 'p-1',
      name: 'Pellets',
      feedType: 'FLOATING',
      unit: 'kg',
      quantity: 10,
      lowStockThreshold: null,
      createdAt: new Date(),
    });
    const items: jest.Mocked<InventoryItemRepositoryPort> = {
      findAllInCurrentProject: jest.fn().mockResolvedValue([one]),
      findById: jest.fn(),
      save: jest.fn(),
    };
    const useCase = new ListInventoryUseCase(items);
    const result = await useCase.execute();
    expect(result).toEqual([one]);
  });
});
