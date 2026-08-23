import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../../platform/config/env.validation';
import { PasswordResetNotifierPort } from '../application/ports/password-reset-notifier.port';

/**
 * Stand-in `PasswordResetNotifierPort` (TASK-009, BACKLOG non-goal: "no email templating engine
 * — adapter only"). No real mailer/provider is specified anywhere in the specs yet, so this
 * adapter logs the reset token instead of emailing it.
 *
 * **It refuses to boot under `NODE_ENV=production`.** Two things are wrong with shipping it:
 * account recovery would be silently non-functional (the user gets a 202, but no token ever
 * reaches them, so nobody locked out can get back in), and a live credential would be written
 * into application logs — which are typically shipped to an aggregator with far broader read
 * access than the mailbox the token was meant for. Failing fast at boot turns both into a loud
 * signal on the first production deploy rather than a hole nobody notices; it matches the
 * fail-fast posture config validation already takes (AC-002).
 *
 * Swap the `PASSWORD_RESET_NOTIFIER` binding in `identity.module.ts` for a real channel (SMTP,
 * transactional-email provider) when one is chosen; `RequestResetUseCase` needs no change.
 */
@Injectable()
export class LoggingPasswordResetNotifier implements PasswordResetNotifierPort {
  private readonly logger = new Logger(LoggingPasswordResetNotifier.name);

  constructor(@Inject(ConfigService) config: ConfigService<AppEnv, true>) {
    if (config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new Error(
        'LoggingPasswordResetNotifier is a development stand-in and must not run in production: ' +
          'it logs reset tokens instead of delivering them, so password reset would be both ' +
          'non-functional and a credential leak. Bind PASSWORD_RESET_NOTIFIER to a real mailer.',
      );
    }
  }

  async send(email: string, rawToken: string): Promise<void> {
    this.logger.log(`Password reset requested for ${email} — token: ${rawToken}`);
  }
}
