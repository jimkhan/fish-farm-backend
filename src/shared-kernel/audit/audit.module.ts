import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { AuditInterceptor } from './audit.interceptor';
import { AuditWriter } from './audit.writer';

/**
 * Shared-kernel audit trail (TASK-005, FT-005). Registers the audit interceptor globally and
 * owns the request-transaction context. Feature modules import this module so their
 * `ScopedRepository` instances receive the SAME `TransactionContext` the interceptor binds —
 * that identity is what puts domain writes and audit entries in one transaction (AC-006/007).
 */
@Module({
  providers: [
    TransactionContext,
    AuditWriter,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [TransactionContext, AuditWriter],
})
export class AuditModule {}
