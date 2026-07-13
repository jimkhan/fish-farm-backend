/**
 * Delivery abstraction for the password-reset token (TASK-009, BACKLOG non-goal: "no email
 * templating engine — adapter only"). The use-case depends on this port, not a concrete mailer,
 * so the real channel (SMTP, transactional-email provider, …) can be swapped in later without
 * touching `RequestResetUseCase`.
 */
export interface PasswordResetNotifierPort {
  /** `rawToken` is the one-time plaintext secret — never logged or persisted by the caller. */
  send(email: string, rawToken: string): Promise<void>;
}

export const PASSWORD_RESET_NOTIFIER = 'PasswordResetNotifierPort';
