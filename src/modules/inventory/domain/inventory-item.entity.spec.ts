import { InventoryItem } from './inventory-item.entity';

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

describe('InventoryItem entity (TASK-020)', () => {
  it('applyDelta adjusts quantity by a signed amount', () => {
    const i = item({ quantity: 100 });
    expect(i.applyDelta(-30).quantity).toBe(70);
    expect(i.applyDelta(50).quantity).toBe(150);
  });

  describe('R6/AC-079: crossesLowStockThreshold', () => {
    it('true when quantity crosses from at/above threshold to below', () => {
      expect(InventoryItem.crossesLowStockThreshold(20, 15, 20)).toBe(true);
      expect(InventoryItem.crossesLowStockThreshold(25, 19, 20)).toBe(true);
    });

    it('false when already below threshold before this delta (no re-fire)', () => {
      expect(InventoryItem.crossesLowStockThreshold(15, 10, 20)).toBe(false);
    });

    it('false when staying at/above threshold', () => {
      expect(InventoryItem.crossesLowStockThreshold(50, 30, 20)).toBe(false);
    });

    it('false when there is no configured threshold', () => {
      expect(InventoryItem.crossesLowStockThreshold(50, 0, null)).toBe(false);
    });
  });
});
