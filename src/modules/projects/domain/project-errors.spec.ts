import { DomainError } from '../../../shared-kernel/errors/domain-error';
import { ProjectClosedError } from './project-errors';

describe('Project domain errors (TASK-011, MOD-03 §2.6)', () => {
  it('ProjectClosedError: 409, read-only message (AC-036)', () => {
    const err = new ProjectClosedError();
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('PROJECT_CLOSED');
    expect(err.httpStatus).toBe(409);
    expect(err.message).toBe('This project is closed and read-only.');
  });
});
