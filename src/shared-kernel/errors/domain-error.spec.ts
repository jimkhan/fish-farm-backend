import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  ScopeRequiredError,
  UnauthenticatedError,
  UnprocessableError,
  ValidationError,
} from './domain-error';

describe('DomainError hierarchy (TASK-003, FT-006)', () => {
  const cases = [
    { ctor: NotFoundError, code: 'NOT_FOUND', httpStatus: 404 },
    { ctor: ForbiddenError, code: 'FORBIDDEN', httpStatus: 403 },
    { ctor: ValidationError, code: 'VALIDATION', httpStatus: 400 },
    { ctor: ConflictError, code: 'CONFLICT', httpStatus: 409 },
    { ctor: UnprocessableError, code: 'UNPROCESSABLE', httpStatus: 422 },
    { ctor: ScopeRequiredError, code: 'SCOPE_REQUIRED', httpStatus: 400 },
    { ctor: UnauthenticatedError, code: 'UNAUTHENTICATED', httpStatus: 401 },
  ] as const;

  it.each(cases)(
    '$ctor.name carries code $code, httpStatus $httpStatus, and is a DomainError',
    ({ ctor, code, httpStatus }) => {
      const err = new ctor('boom');
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe(code);
      expect(err.httpStatus).toBe(httpStatus);
      expect(err.name).toBe(ctor.name);
      expect(err.message).toBe('boom');
    },
  );

  it('carries optional machine-readable details', () => {
    const err = new NotFoundError('Pond not found', { pondId: 'p-1' });
    expect(err.details).toEqual({ pondId: 'p-1' });
  });

  it('ForbiddenError defaults to the uniform anti-enumeration message (MOD-01 §2.6)', () => {
    expect(new ForbiddenError().message).toBe('You do not have access to this resource.');
  });

  it('ScopeRequiredError defaults to the MOD-01 §2.6 message', () => {
    expect(new ScopeRequiredError().message).toBe('Project scope is required.');
  });

  it('UnauthenticatedError defaults to a generic message', () => {
    expect(new UnauthenticatedError().message).toBe('Authentication required.');
  });

  it('imports no framework — domain layers may depend on it (invariant #2)', () => {
    const source = readFileSync(join(__dirname, 'domain-error.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import\b/m);
    expect(source).not.toMatch(/\brequire\s*\(/);
  });
});
