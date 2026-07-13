import { Stocking } from './stocking.entity';

describe('Stocking (TASK-019, MOD-04 §4.3)', () => {
  it('reconstitute() round-trips every field', () => {
    const stocking = Stocking.reconstitute({
      id: 's-1',
      projectId: 'p-1',
      pondId: 'pond-1',
      speciesId: 'species-1',
      source: 'HATCHERY',
      hatcheryName: 'Riverside Hatchery',
      count: 5000,
      stockedOn: new Date('2026-01-01'),
      stockingCostMinor: 500000,
      currency: 'BDT',
      createdAt: new Date(),
    });

    expect(stocking.id).toBe('s-1');
    expect(stocking.pondId).toBe('pond-1');
    expect(stocking.speciesId).toBe('species-1');
    expect(stocking.source).toBe('HATCHERY');
    expect(stocking.hatcheryName).toBe('Riverside Hatchery');
    expect(stocking.count).toBe(5000);
    expect(stocking.stockingCostMinor).toBe(500000);
    expect(stocking.currency).toBe('BDT');
  });

  it('allows null source/hatcheryName/stockingCost (AC-062, cost is optional)', () => {
    const stocking = Stocking.reconstitute({
      id: 's-1',
      projectId: 'p-1',
      pondId: 'pond-1',
      speciesId: 'species-1',
      source: null,
      hatcheryName: null,
      count: 5000,
      stockedOn: new Date('2026-01-01'),
      stockingCostMinor: null,
      currency: null,
      createdAt: new Date(),
    });

    expect(stocking.source).toBeNull();
    expect(stocking.stockingCostMinor).toBeNull();
    expect(stocking.currency).toBeNull();
  });
});
