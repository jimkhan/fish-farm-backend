import { HarvestRevenueEarned } from '@fish-farm/shared';
import { FinancialTxn } from '../domain/financial-txn.entity';
import { FinancialTxnEventRepositoryPort } from './ports/financial-txn-event-repository.port';
import { OnHarvestRevenueEarnedHandler } from './on-harvest-revenue-earned.handler';

function makeEvent(overrides: Partial<HarvestRevenueEarned> = {}): HarvestRevenueEarned {
  return {
    name: 'HarvestRevenueEarned',
    eventId: 'e-1',
    occurredAt: new Date('2026-01-01'),
    projectId: 'p-1',
    batchId: 'batch-1',
    harvestId: 'harvest-1',
    revenueMinor: 500000,
    ...overrides,
  };
}

function setup(overrides: { existing?: FinancialTxn | null } = {}) {
  const txns: jest.Mocked<FinancialTxnEventRepositoryPort> = {
    findBySourceRef: jest.fn().mockResolvedValue(overrides.existing ?? null),
    save: jest.fn().mockImplementation((t) => Promise.resolve(t)),
  };
  const handler = new OnHarvestRevenueEarnedHandler(txns);
  return { handler, txns };
}

describe('OnHarvestRevenueEarnedHandler (TASK-032, R3, AC-108)', () => {
  it('records a HARVEST revenue idempotent by sourceRef = Harvest.id (not batchId)', async () => {
    const { handler, txns } = setup();
    await handler.handle(makeEvent());
    expect(txns.save).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'REVENUE', category: 'HARVEST', amountMinor: 500000, sourceRef: 'harvest-1' }),
    );
  });

  it('a second harvest on the same batch is a distinct sourceRef, not deduped away', async () => {
    const { handler, txns } = setup();
    await handler.handle(makeEvent({ harvestId: 'harvest-1' }));
    await handler.handle(makeEvent({ harvestId: 'harvest-2' }));
    expect(txns.save).toHaveBeenCalledTimes(2);
  });

  it('AC-117: never double-ingests an already-recorded sourceRef', async () => {
    const existing = FinancialTxn.reconstitute({
      id: 't-1',
      projectId: 'p-1',
      kind: 'REVENUE',
      category: 'HARVEST',
      amountMinor: 500000,
      occurredOn: new Date(),
      sourceRef: 'harvest-1',
      note: null,
      createdAt: new Date(),
    });
    const { handler, txns } = setup({ existing });
    await handler.handle(makeEvent());
    expect(txns.save).not.toHaveBeenCalled();
  });
});
