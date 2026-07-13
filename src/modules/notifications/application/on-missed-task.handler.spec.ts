import { MissedTask } from '@fish-farm/shared';
import { RaiseAlertUseCase } from './raise-alert.usecase';
import { OnMissedTaskHandler } from './on-missed-task.handler';

describe('OnMissedTaskHandler (TASK-015)', () => {
  it('raises MISSED_TASK as WARNING (operational, not owner-critical)', async () => {
    const raiseAlert = { execute: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<
      RaiseAlertUseCase
    >;
    const handler = new OnMissedTaskHandler(raiseAlert);

    const event: MissedTask = {
      name: 'MissedTask',
      eventId: 'evt-1',
      occurredAt: new Date(),
      projectId: 'p-1',
      sourceRef: 'task-1',
      message: 'Chain drag not logged by deadline',
    };
    await handler.handle(event);

    expect(raiseAlert.execute).toHaveBeenCalledWith({
      projectId: 'p-1',
      type: 'MISSED_TASK',
      severity: 'WARNING',
      sourceRef: 'task-1',
      message: 'Chain drag not logged by deadline',
    });
  });
});
