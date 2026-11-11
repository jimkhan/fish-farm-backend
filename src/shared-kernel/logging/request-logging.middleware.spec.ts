import { Logger } from '@nestjs/common';
import {
  LoggedRequest,
  LoggedResponse,
  RequestLoggingMiddleware,
} from './request-logging.middleware';

function makeRes(statusCode: number, contentLength?: string) {
  const listeners: Record<string, () => void> = {};
  const res: LoggedResponse = {
    statusCode,
    getHeader: (name) => (name === 'content-length' ? contentLength : undefined),
    on: (event, listener) => {
      listeners[event] = listener;
      return res;
    },
  };
  return { res, fire: (event: 'finish' | 'close') => listeners[event]?.() };
}

function makeReq(overrides: Partial<LoggedRequest> = {}): LoggedRequest {
  return {
    method: 'GET',
    url: '/projects/p1/ponds?limit=10&token=abc',
    originalUrl: '/projects/p1/ponds?limit=10&token=abc',
    headers: { 'user-agent': 'okhttp/4.12', 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
    ip: '10.0.0.1',
    ...overrides,
  };
}

function middleware(logBody = false) {
  return new RequestLoggingMiddleware({ get: () => logBody } as never);
}

describe('RequestLoggingMiddleware', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  let debug: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('calls next() and logs arrival at debug', () => {
    const next = jest.fn();
    middleware().use(makeReq(), makeRes(200).res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'http.request.start',
        method: 'GET',
        path: '/projects/p1/ponds',
      }),
    );
  });

  it('emits one info line on finish with the full structured shape, reading late-bound fields', () => {
    const req = makeReq();
    const { res, fire } = makeRes(200, '142');
    middleware().use(req, res, () => undefined);

    // Populated by later pipeline stages, before the response finishes.
    req.correlationId = 'corr-12345678';
    req.user = { id: 'user-1' };
    req.tenant = { userId: 'user-1', projectId: 'p1', role: 'OWNER' };
    req.route = { path: '/projects/:projectId/ponds' };
    req.query = { limit: '10', token: 'abc' };
    req.log = { handler: 'PondsController.listHandler' };

    fire('finish');
    fire('close'); // must not double-log

    expect(log).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    const entry = log.mock.calls[0][0];
    expect(entry).toMatchObject({
      event: 'http.request',
      method: 'GET',
      path: '/projects/p1/ponds',
      route: '/projects/:projectId/ponds',
      status: 200,
      correlationId: 'corr-12345678',
      userId: 'user-1',
      projectId: 'p1',
      role: 'OWNER',
      handler: 'PondsController.listHandler',
      ip: '203.0.113.9',
      userAgent: 'okhttp/4.12',
      responseBytes: 142,
      query: { limit: '10', token: '[REDACTED]' },
    });
    expect(entry.msg).toMatch(/^GET \/projects\/:projectId\/ponds 200 \d+(\.\d)?ms$/);
    expect(typeof entry.durationMs).toBe('number');
    expect(entry.body).toBeUndefined();
    expect(entry.aborted).toBeUndefined();
  });

  it('logs 4xx at warn with the error stamped by the exception filter', () => {
    const req = makeReq({ method: 'POST' });
    const { res, fire } = makeRes(400);
    middleware().use(req, res, () => undefined);
    req.log = {
      handler: 'PondsController.createHandler',
      error: { code: 'VALIDATION', message: 'Validation failed.', details: { errors: ['name'] } },
    };
    fire('finish');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatchObject({
      status: 400,
      errorCode: 'VALIDATION',
      errorMessage: 'Validation failed.',
      errorDetails: { errors: ['name'] },
    });
  });

  it('logs 5xx at error and marks a client abort', () => {
    const req = makeReq();
    const { res, fire } = makeRes(500);
    middleware().use(req, res, () => undefined);
    fire('close');
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toMatchObject({ status: 500, aborted: true, route: null });
  });

  it('includes the redacted body only when LOG_HTTP_BODY is on and the method carries one', () => {
    const body = { name: 'Pond A', password: 'x' };
    const post = makeReq({ method: 'POST', body });
    const a = makeRes(201);
    middleware(true).use(post, a.res, () => undefined);
    a.fire('finish');
    expect(log.mock.calls[0][0].body).toEqual({ name: 'Pond A', password: '[REDACTED]' });

    const get = makeReq({ method: 'GET', body });
    const b = makeRes(200);
    middleware(true).use(get, b.res, () => undefined);
    b.fire('finish');
    expect(log.mock.calls[1][0].body).toBeUndefined();

    const off = makeReq({ method: 'POST', body });
    const c = makeRes(201);
    middleware(false).use(off, c.res, () => undefined);
    c.fire('finish');
    expect(log.mock.calls[2][0].body).toBeUndefined();
  });
});
