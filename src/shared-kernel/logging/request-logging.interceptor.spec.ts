import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { RequestLoggingInterceptor } from './request-logging.interceptor';
import { RequestWithLogState } from './request-log-state';

class PondsController {
  createHandler(): void {}
}

function ctx(req: RequestWithLogState, type = 'http'): ExecutionContext {
  return {
    getType: () => type,
    getClass: () => PondsController,
    getHandler: () => PondsController.prototype.createHandler,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('RequestLoggingInterceptor', () => {
  it('stamps Controller.method onto the request and passes the stream through', async () => {
    const req: RequestWithLogState = { log: { error: { code: 'X', message: 'kept' } } };
    const next: CallHandler = { handle: () => of('result') };

    const out = await new RequestLoggingInterceptor().intercept(ctx(req), next).toPromise();

    expect(out).toBe('result');
    expect(req.log).toEqual({
      handler: 'PondsController.createHandler',
      error: { code: 'X', message: 'kept' },
    });
  });

  it('ignores non-HTTP execution contexts', () => {
    const req: RequestWithLogState = {};
    new RequestLoggingInterceptor().intercept(ctx(req, 'rpc'), { handle: () => of(null) });
    expect(req.log).toBeUndefined();
  });
});
