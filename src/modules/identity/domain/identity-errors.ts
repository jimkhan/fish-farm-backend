import { DomainError } from '../../../shared-kernel/errors/domain-error';

/**
 * Identity-specific domain errors (TASK-008, MOD-02 §2.6). Extend the shared `DomainError`
 * base directly rather than growing shared-kernel's error list (TASK-003 non-goal) — each
 * subclass self-describes its own `code`/`httpStatus` as a plain literal, so this file needs
 * no framework import and stays safe to throw from `domain/`.
 */

/** Wrong password or unknown email — identical message either way (AC-016, no enumeration). */
export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';
  readonly httpStatus = 401;

  constructor(details?: Record<string, unknown>) {
    super('Invalid email or password.', details);
  }
}

/** A refresh token already used once (rotated) was presented again (AC-019, R2 replay). */
export class TokenRevokedError extends DomainError {
  readonly code = 'TOKEN_REVOKED';
  readonly httpStatus = 401;

  constructor(details?: Record<string, unknown>) {
    super('Please sign in again.', details);
  }
}

/** A password-reset token was expired or already used (AC-020, R9). */
export class ResetTokenInvalidError extends DomainError {
  readonly code = 'RESET_TOKEN_INVALID';
  readonly httpStatus = 400;

  constructor(details?: Record<string, unknown>) {
    super('This reset link is no longer valid.', details);
  }
}

/** A user already an active Worker elsewhere was assigned Worker on another project (AC-024, R4). */
export class WorkerAlreadyAssignedError extends DomainError {
  readonly code = 'WORKER_ALREADY_ASSIGNED';
  readonly httpStatus = 409;

  constructor(details?: Record<string, unknown>) {
    super('This worker is already assigned to an active project.', details);
  }
}

/** Removing a project's last active Owner was attempted (AC-027, R7). */
export class LastOwnerError extends DomainError {
  readonly code = 'LAST_OWNER';
  readonly httpStatus = 409;

  constructor(details?: Record<string, unknown>) {
    super('A project must have at least one owner.', details);
  }
}
