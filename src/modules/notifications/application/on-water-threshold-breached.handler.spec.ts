import { WaterThresholdBreached } from '@fish-farm/shared';
import { RaiseAlertUseCase } from './raise-alert.usecase';
import { OnWaterThresholdBreachedHandler } from './on-water-threshold-breached.handler';

describe('OnWaterThresholdBreachedHandler (TASK-015, MOD-09 F1)', () => {
  it('relays the source event severity — a routine breach stays WARNING, a severe one is CRITICAL', async () => {
    const raiseAlert = { execute: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<
      RaiseAlertUseCase
    >;
    const handler = new OnWaterThresholdBreachedHandler(raiseAlert);

    const warning: WaterThresholdBreached = {
      name: 'WaterThresholdBreached',
      eventId: 'evt-1',
      occurredAt: new Date(),
      projectId: 'p-1',
      sourceRef: 'pond-1',
      severity: 'WARNING',
      message: 'DO slightly low',
    };
    await handler.handle(warning);
    expect(raiseAlert.execute).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'WATER_THRESHOLD', severity: 'WARNING', sourceRef: 'pond-1' }),
    );

    const critical: WaterThresholdBreached = { ...warning, severity: 'CRITICAL' };
    await handler.handle(critical);
    expect(raiseAlert.execute).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'WATER_THRESHOLD', severity: 'CRITICAL' }),
    );
  });
});
