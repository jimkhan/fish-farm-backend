import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

/**
 * Holds the request's active transaction (TASK-005, AC-006/007). `AuditInterceptor` opens a
 * transaction per state-changing request and runs the handler inside `run()`; anything that
 * reads `manager` within that async scope — notably `ScopedRepository` — joins the same
 * transaction, so the domain write and its audit entry commit or roll back together.
 *
 * Registered (and exported) by `AuditModule`; feature modules import `AuditModule` so their
 * scoped repositories share the interceptor's instance.
 */
@Injectable()
export class TransactionContext {
  private readonly storage = new AsyncLocalStorage<EntityManager>();

  /** Runs `fn` with `manager` as the ambient transactional EntityManager. */
  run<T>(manager: EntityManager, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(manager, fn);
  }

  /** The transactional manager of the current async scope, if a transaction is active. */
  get manager(): EntityManager | undefined {
    return this.storage.getStore();
  }
}
