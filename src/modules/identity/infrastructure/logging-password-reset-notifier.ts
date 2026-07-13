import { Injectable, Logger } from '@nestjs/common';
import { PasswordResetNotifierPort } from '../application/ports/password-reset-notifier.port';

/**
 * Stand-in `PasswordResetNotifierPort` (TASK-009, BACKLOG non-goal: "no email templating engine
 * — adapter only"). No real mailer/provider is specified anywhere in the specs yet, so this
 * adapter logs the reset token instead of emailing it — safe for dev/CI, no secrets, no new
 * dependency. Swap the `PASSWORD_RESET_NOTIFIER` binding in `identity.module.ts` for a real
 * channel (SMTP, transactional-email provider) when one is chosen; `RequestResetUseCase` needs no
 * change.
 */
@Injectable()
export class LoggingPasswordResetNotifier implements PasswordResetNotifierPort {
  private readonly logger = new Logger(LoggingPasswordResetNotifier.name);

  async send(email: string, rawToken: string): Promise<void> {
    this.logger.log(`Password reset requested for ${email} — token: ${rawToken}`);
  }
}
