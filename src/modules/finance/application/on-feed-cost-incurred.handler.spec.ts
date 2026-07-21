import { FeedCostIncurred } from '@fish-farm/shared';
import { FinancialTxn } from '../domain/financial-txn.entity';
import { FinancialTxnEventRepositoryPort } from './ports/financial-txn-event-repository.port';
import { OnFeedCostIncurredHandler } from './on-feed-cost-incurred.handler';

function makeEvent(overrides: Partial<FeedCostIncurred> = {}): FeedCostIncurred {
  return {
    name: 'FeedCostIncurred',
    eventId: 'e-1',
    occurredAt: new Date('2026-01-01'),
    projectId: 'p-1',
    sourceRef: 'txn-1',
    costMinor: 50000,
    ...overrides,
  };
}

function setup(overrides: { existing?: FinancialTxn | null } = {}) {
  const txns: jest.Mocked<FinancialTxnEventRepositoryPort> = {
    findBySourceRef: jest.fn().mockResolvedValue(overrides.existing ?? null),
    save: jest.fn().mockImplementation((t) => Promise.resolve(t)),
  };
  const handler = new OnFeedCostIncurredHandler(txns);
  return { handler, txns };
}

describe('OnFeedCostIncurredHandler (TASK-032, R3, AC-109)', () => {
  it('records a FEED cost idempotent by sourceRef = InventoryTxn.id', async () => {
    const { handler, txns } = setup();
    await handler.handle(makeEvent());
    expect(txns.save).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'COST', category: 'FEED', amountMinor: 50000, sourceRef: 'txn-1' }),
    );
  });

  it('AC-117: never double-ingests an already-recorded sourceRef', async () => {
    const existing = FinancialTxn.reconstitute({
      id: 't-1',
      projectId: 'p-1',
      kind: 'COST',
      category: 'FEED',
      amountMinor: 50000,
      occurredOn: new Date(),
      sourceRef: 'txn-1',
      note: null,
      createdAt: new Date(),
    });
    const { handler, txns } = setup({ existing });
    await handler.handle(makeEvent());
    expect(txns.save).not.toHaveBeenCalled();
  });
});
