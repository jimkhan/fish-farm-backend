import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { RequestWithLogState, stampRequestLog } from './request-log-state';

/**
 * Global interceptor whose only job is to record which handler a request resolved to
 * (`PondsController.createHandler`) so `RequestLoggingMiddleware` can name the endpoint in its
 * summary line. Interceptors are the earliest stage with access to the resolved handler; the
 * middleware itself runs before routing. Passes the observable through untouched — no
 * side effects on the response, no extra transaction, no ordering constraint with
 * `AuditInterceptor`.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest<RequestWithLogState>();
      stampRequestLog(req, {
        handler: `${context.getClass().name}.${context.getHandler().name}`,
      });
    }
    return next.handle();
  }
}
