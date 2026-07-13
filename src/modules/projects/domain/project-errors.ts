import { DomainError } from '../../../shared-kernel/errors/domain-error';

/** A write targeted a `CLOSED` project — reads still succeed (AC-036, R4). */
export class ProjectClosedError extends DomainError {
  readonly code = 'PROJECT_CLOSED';
  readonly httpStatus = 409;

  constructor(details?: Record<string, unknown>) {
    super('This project is closed and read-only.', details);
  }
}
