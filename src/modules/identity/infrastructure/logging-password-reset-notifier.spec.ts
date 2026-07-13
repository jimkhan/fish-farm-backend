import { Logger } from '@nestjs/common';
import { LoggingPasswordResetNotifier } from './logging-password-reset-notifier';

describe('LoggingPasswordResetNotifier (TASK-009, stand-in PasswordResetNotifierPort)', () => {
  it('logs the email and raw token so it is reachable during development', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const notifier = new LoggingPasswordResetNotifier();

    await notifier.send('owner@example.com', 'raw-secret-token');

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('owner@example.com'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('raw-secret-token'));
    logSpy.mockRestore();
  });
});
