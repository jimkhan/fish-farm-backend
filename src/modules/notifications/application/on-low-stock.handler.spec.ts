import { LowStock } from '@fish-farm/shared';
import { RaiseAlertUseCase } from './raise-alert.usecase';
import { OnLowStockHandler } from './on-low-stock.handler';

describe('OnLowStockHandler (TASK-015)', () => {
  it('raises LOW_STOCK as WARNING (operational, not owner-critical)', async () => {
    const raiseAlert = { execute: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<
      RaiseAlertUseCase
    >;
    const handler = new OnLowStockHandler(raiseAlert);

    const event: LowStock = {
      name: 'LowStock',
      eventId: 'evt-1',
      occurredAt: new Date(),
      projectId: 'p-1',
      sourceRef: 'item-1',
      message: 'Feed below reorder threshold',
    };
    await handler.handle(event);

    expect(raiseAlert.execute).toHaveBeenCalledWith({
      projectId: 'p-1',
      type: 'LOW_STOCK',
      severity: 'WARNING',
      sourceRef: 'item-1',
      message: 'Feed below reorder threshold',
    });
  });
});
