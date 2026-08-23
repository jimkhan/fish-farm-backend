import { Global, Module } from '@nestjs/common';
import { TransactionContext } from './transaction-context';

/**
 * Owns the request-transaction context (TASK-005).
 *
 * Split out of `AuditModule` so a consumer can depend on `TransactionContext` alone. Two
 * modules need it for unrelated reasons — `AuditInterceptor` opens the transaction, and
 * `DomainEventBus` takes a savepoint per handler attempt within it — and routing the second
 * through `AuditModule` would drag `AuditInterceptor`'s `DataSource` dependency into every
 * module that merely publishes an event, including minimal test apps that boot without a
 * database.
 *
 * `@Global()` because the context is an ambient, app-wide `AsyncLocalStorage` singleton: its
 * usefulness depends on every scoped repository, the interceptor, and the bus sharing one
 * instance, which is exactly what a global single registration guarantees.
 */
@Global()
@Module({
  providers: [TransactionContext],
  exports: [TransactionContext],
})
export class TransactionModule {}
