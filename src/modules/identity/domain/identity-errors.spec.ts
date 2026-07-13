import { DomainError } from '../../../shared-kernel/errors/domain-error';
import {
  InvalidCredentialsError,
  LastOwnerError,
  ResetTokenInvalidError,
  TokenRevokedError,
  WorkerAlreadyAssignedError,
} from './identity-errors';

describe('Identity domain errors (TASK-008/TASK-009/TASK-010, MOD-02 §2.6)', () => {
  it('InvalidCredentialsError: 401, uniform no-enumeration message (AC-016)', () => {
    const err = new InvalidCredentialsError();
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('INVALID_CREDENTIALS');
    expect(err.httpStatus).toBe(401);
    expect(err.message).toBe('Invalid email or password.');
  });

  it('TokenRevokedError: 401, re-login message (AC-019)', () => {
    const err = new TokenRevokedError();
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('TOKEN_REVOKED');
    expect(err.httpStatus).toBe(401);
    expect(err.message).toBe('Please sign in again.');
  });

  it('ResetTokenInvalidError: 400, no-longer-valid message (AC-020)', () => {
    const err = new ResetTokenInvalidError();
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('RESET_TOKEN_INVALID');
    expect(err.httpStatus).toBe(400);
    expect(err.message).toBe('This reset link is no longer valid.');
  });

  it('WorkerAlreadyAssignedError: 409, worker-conflict message (AC-024)', () => {
    const err = new WorkerAlreadyAssignedError();
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('WORKER_ALREADY_ASSIGNED');
    expect(err.httpStatus).toBe(409);
    expect(err.message).toBe('This worker is already assigned to an active project.');
  });

  it('LastOwnerError: 409, at-least-one-owner message (AC-027)', () => {
    const err = new LastOwnerError();
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('LAST_OWNER');
    expect(err.httpStatus).toBe(409);
    expect(err.message).toBe('A project must have at least one owner.');
  });
});
