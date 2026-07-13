import { WaterEmergencyRaised } from '@fish-farm/shared';
import { RaiseAlertUseCase } from './raise-alert.usecase';
import { OnWaterEmergencyRaisedHandler } from './on-water-emergency-raised.handler';

describe('OnWaterEmergencyRaisedHandler (TASK-015, MOD-09 R3 — always CRITICAL)', () => {
  it('always raises WATER_EMERGENCY as CRITICAL', async () => {
    const raiseAlert = { execute: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<
      RaiseAlertUseCase
    >;
    const handler = new OnWaterEmergencyRaisedHandler(raiseAlert);

    const event: WaterEmergencyRaised = {
      name: 'WaterEmergencyRaised',
      eventId: 'evt-1',
      occurredAt: new Date(),
      projectId: 'p-1',
      sourceRef: 'pond-1',
      message: 'Total DO crash',
    };
    await handler.handle(event);

    expect(raiseAlert.execute).toHaveBeenCalledWith({
      projectId: 'p-1',
      type: 'WATER_EMERGENCY',
      severity: 'CRITICAL',
      sourceRef: 'pond-1',
      message: 'Total DO crash',
    });
  });
});
