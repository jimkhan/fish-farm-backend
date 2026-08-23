import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TransactionModule } from '../../platform/persistence/transaction.module';
import { AuditInterceptor } from './audit.interceptor';
import { AuditWriter } from './audit.writer';

/**
 * Shared-kernel audit trail (TASK-005, FT-005). Registers the audit interceptor globally and
 * owns the request-transaction context. Feature modules import this module so their
 * `ScopedRepository` instances receive the SAME `TransactionContext` the interceptor binds —
 * that identity is what puts domain writes and audit entries in one transaction (AC-006/007).
 */
@Module({
  // `TransactionContext` now comes from `TransactionModule` (global) rather than being provided
  // here, so the bus can depend on it without pulling in this module's DataSource. Still
  // re-exported so the feature modules that import `AuditModule` for it need no change.
  imports: [TransactionModule],
  providers: [AuditWriter, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  // `TransactionModule`, not `TransactionContext`: Nest only lets a module export providers it
  // declares itself, so a token that arrives via `imports` has to be re-exported as its module.
  // Importers of `AuditModule` still resolve `TransactionContext` exactly as before.
  exports: [TransactionModule, AuditWriter],
})
export class AuditModule {}
