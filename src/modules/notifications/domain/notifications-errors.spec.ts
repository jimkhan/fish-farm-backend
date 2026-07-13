import { DomainError } from '../../../shared-kernel/errors/domain-error';
import { InvalidTransitionError } from './notifications-errors';

describe('Notifications domain errors (TASK-015, MOD-09 §2.6)', () => {
  it('InvalidTransitionError: 409, invalid-change message (AC-051)', () => {
    const err = new InvalidTransitionError();
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('INVALID_TRANSITION');
    expect(err.httpStatus).toBe(409);
    expect(err.message).toBe('Invalid alert state change.');
  });
});
