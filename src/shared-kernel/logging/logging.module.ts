import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RequestLoggingInterceptor } from './request-logging.interceptor';
import { RequestLoggingMiddleware } from './request-logging.middleware';
import { StructuredLogger } from './structured-logger';

/**
 * Shared-kernel observability (NFR-005): the structured application logger plus one summary
 * log line for every HTTP request. `@Global()` so `main.ts` can `app.get(StructuredLogger)` and
 * so no feature module needs to import anything to be logged — coverage is by construction, not
 * by remembering to add a decorator per controller.
 */
@Global()
@Module({
  providers: [StructuredLogger, { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor }],
  exports: [StructuredLogger],
})
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
