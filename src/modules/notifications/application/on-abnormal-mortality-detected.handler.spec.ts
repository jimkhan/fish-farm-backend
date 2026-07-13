import { AbnormalMortalityDetected } from '@fish-farm/shared';
import { RaiseAlertUseCase } from './raise-alert.usecase';
import { OnAbnormalMortalityDetectedHandler } from './on-abnormal-mortality-detected.handler';

describe('OnAbnormalMortalityDetectedHandler (TASK-015)', () => {
  it('raises ABNORMAL_MORTALITY as WARNING (Owner still sees it via R2\'s blanket rule)', async () => {
    const raiseAlert = { execute: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<
      RaiseAlertUseCase
    >;
    const handler = new OnAbnormalMortalityDetectedHandler(raiseAlert);

    const event: AbnormalMortalityDetected = {
      name: 'AbnormalMortalityDetected',
      eventId: 'evt-1',
      occurredAt: new Date(),
      projectId: 'p-1',
      sourceRef: 'batch-1',
      message: 'Mortality spike vs baseline',
    };
    await handler.handle(event);

    expect(raiseAlert.execute).toHaveBeenCalledWith({
      projectId: 'p-1',
      type: 'ABNORMAL_MORTALITY',
      severity: 'WARNING',
      sourceRef: 'batch-1',
      message: 'Mortality spike vs baseline',
    });
  });
});
