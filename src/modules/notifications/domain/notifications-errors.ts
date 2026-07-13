import { DomainError } from '../../../shared-kernel/errors/domain-error';

/** An alert state transition outside the allowed graph was attempted (AC-051, MOD-09 §2.6). */
export class InvalidTransitionError extends DomainError {
  readonly code = 'INVALID_TRANSITION';
  readonly httpStatus = 409;

  constructor(details?: Record<string, unknown>) {
    super('Invalid alert state change.', details);
  }
}
