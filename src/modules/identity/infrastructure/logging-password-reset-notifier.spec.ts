import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggingPasswordResetNotifier } from './logging-password-reset-notifier';

function configFor(nodeEnv: string): ConfigService {
  return { get: jest.fn().mockReturnValue(nodeEnv) } as unknown as ConfigService;
}

describe('LoggingPasswordResetNotifier (TASK-009, stand-in PasswordResetNotifierPort)', () => {
  it('logs the email and raw token so it is reachable during development', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const notifier = new LoggingPasswordResetNotifier(configFor('development') as never);

    await notifier.send('owner@example.com', 'raw-secret-token');

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('owner@example.com'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('raw-secret-token'));
    logSpy.mockRestore();
  });

  it('is constructible under test', () => {
    expect(() => new LoggingPasswordResetNotifier(configFor('test') as never)).not.toThrow();
  });

  it('refuses to boot in production — shipping it would make reset non-functional AND leak a live credential to logs', () => {
    expect(() => new LoggingPasswordResetNotifier(configFor('production') as never)).toThrow(
      /must not run in production/,
    );
  });
});
