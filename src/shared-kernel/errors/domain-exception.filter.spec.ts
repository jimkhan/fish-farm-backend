import { ArgumentsHost, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { CORRELATION_HEADER } from './correlation.middleware';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ScopeRequiredError,
  UnprocessableError,
  ValidationError,
} from './domain-error';
import { DomainExceptionFilter, ErrorResponseBody } from './domain-exception.filter';

interface CapturedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body?: ErrorResponseBody;
}

function mockHost(correlationId?: string): { host: ArgumentsHost; res: CapturedResponse } {
  const res: CapturedResponse & {
    setHeader(k: string, v: string): void;
    status(c: number): unknown;
    json(b: ErrorResponseBody): void;
  } = {
    statusCode: 0,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
    },
  };
  const req = correlationId === undefined ? {} : { correlationId };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('DomainExceptionFilter (TASK-003, AC-008)', () => {
  const filter = new DomainExceptionFilter();

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it.each([
    { err: new NotFoundError('gone'), status: 404, code: 'NOT_FOUND' },
    { err: new ForbiddenError(), status: 403, code: 'FORBIDDEN' },
    { err: new ValidationError('bad'), status: 400, code: 'VALIDATION' },
    { err: new ConflictError('dup'), status: 409, code: 'CONFLICT' },
    { err: new UnprocessableError('nope'), status: 422, code: 'UNPROCESSABLE' },
    { err: new ScopeRequiredError(), status: 400, code: 'SCOPE_REQUIRED' },
  ])('maps $code to HTTP $status with the Error schema shape', ({ err, status, code }) => {
    const { host, res } = mockHost('req-12345678');
    filter.catch(err, host);
    expect(res.statusCode).toBe(status);
    expect(res.body).toMatchObject({ code, message: err.message, correlationId: 'req-12345678' });
    expect(res.headers[CORRELATION_HEADER]).toBe('req-12345678');
  });

  it('passes DomainError.details through to the response body', () => {
    const { host, res } = mockHost('req-12345678');
    filter.catch(new NotFoundError('Pond not found', { pondId: 'p-1' }), host);
    expect(res.body?.details).toEqual({ pondId: 'p-1' });
  });

  it('shapes framework HttpExceptions (ValidationPipe 400) as the Error schema', () => {
    const { host, res } = mockHost('req-12345678');
    filter.catch(new BadRequestException(['name must be a string']), host);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: 'VALIDATION',
      message: 'Validation failed.',
      details: { errors: ['name must be a string'] },
      correlationId: 'req-12345678',
    });
  });

  it('shapes unknown-route NotFoundException as NOT_FOUND', () => {
    const { host, res } = mockHost('req-12345678');
    filter.catch(new NotFoundException('Cannot GET /nope'), host);
    expect(res.statusCode).toBe(404);
    expect(res.body?.code).toBe('NOT_FOUND');
  });

  it('maps an unknown error to INTERNAL/500 with an opaque correlation ref (AC-008)', () => {
    const { host, res } = mockHost('req-12345678');
    filter.catch(new Error('secret db string'), host);
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({
      code: 'INTERNAL',
      message: 'Something went wrong (ref: req-12345678).',
      correlationId: 'req-12345678',
    });
    expect(JSON.stringify(res.body)).not.toContain('secret db string');
  });

  it('logs the real cause of an unknown error server-side', () => {
    const { host } = mockHost('req-12345678');
    filter.catch(new Error('secret db string'), host);
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'secret db string',
        correlationId: 'req-12345678',
        code: 'INTERNAL',
        status: 500,
      }),
      expect.any(String),
    );
  });

  it('mints a correlation id when the middleware did not run', () => {
    const { host, res } = mockHost();
    filter.catch(new Error('boom'), host);
    expect(res.body?.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers[CORRELATION_HEADER]).toBe(res.body?.correlationId);
  });
});
