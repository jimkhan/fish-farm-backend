import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CorrelationMiddleware } from './correlation.middleware';
import { DomainExceptionFilter } from './domain-exception.filter';

/**
 * Shared-kernel error contract (TASK-003, FT-006): a correlation id on every request plus the
 * global domain-error → HTTP mapping. Imported once by AppModule; the remaining shared-kernel
 * pieces (tenant TASK-004, audit TASK-005) plug in alongside in their own tasks.
 */
@Module({
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class ErrorsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
