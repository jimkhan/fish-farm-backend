import { StockingRecorded } from '@fish-farm/shared';
import { FinancialTxn } from '../domain/financial-txn.entity';
import { FinancialTxnEventRepositoryPort } from './ports/financial-txn-event-repository.port';
import { OnStockingRecordedHandler } from './on-stocking-recorded.handler';

function makeEvent(overrides: Partial<StockingRecorded> = {}): StockingRecorded {
  return {
    name: 'StockingRecorded',
    eventId: 'e-1',
    occurredAt: new Date('2026-01-01'),
    projectId: 'p-1',
    stockingId: 'stocking-1',
    batchId: 'batch-1',
    pondId: 'pond-1',
    speciesId: 'sp-1',
    stockingCostMinor: 250000,
    ...overrides,
  };
}

function setup(overrides: { existing?: FinancialTxn | null } = {}) {
  const txns: jest.Mocked<FinancialTxnEventRepositoryPort> = {
    findBySourceRef: jest.fn().mockResolvedValue(overrides.existing ?? null),
    save: jest.fn().mockImplementation((t) => Promise.resolve(t)),
  };
  const handler = new OnStockingRecordedHandler(txns);
  return { handler, txns };
}

describe('OnStockingRecordedHandler (TASK-032, R3, AC-109)', () => {
  it('records a STOCKING cost idempotent by sourceRef = stockingId', async () => {
    const { handler, txns } = setup();
    await handler.handle(makeEvent());
    expect(txns.save).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'COST', category: 'STOCKING', amountMinor: 250000, sourceRef: 'stocking-1' }),
    );
  });

  it('skips silently when the event carries no cost', async () => {
    const { handler, txns } = setup();
    await handler.handle(makeEvent({ stockingCostMinor: undefined }));
    expect(txns.save).not.toHaveBeenCalled();
  });

  it('AC-117: never double-ingests an already-recorded sourceRef', async () => {
    const existing = FinancialTxn.reconstitute({
      id: 't-1',
      projectId: 'p-1',
      kind: 'COST',
      category: 'STOCKING',
      amountMinor: 250000,
      occurredOn: new Date(),
      sourceRef: 'stocking-1',
      note: null,
      createdAt: new Date(),
    });
    const { handler, txns } = setup({ existing });
    await handler.handle(makeEvent());
    expect(txns.save).not.toHaveBeenCalled();
  });
});
