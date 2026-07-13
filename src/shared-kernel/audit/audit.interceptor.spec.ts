import { CallHandler, ExecutionContext } from '@nestjs/common';
import { defer, lastValueFrom, of, throwError } from 'rxjs';
import type { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { AuditWriter } from './audit.writer';
import { AuditInterceptor } from './audit.interceptor';

class WidgetsController {}

interface TestRequest {
  method: string;
  url: string;
  params?: Record<string, string>;
  route?: { path?: string };
  user?: { id: string };
  tenant?: { userId: string; projectId: string; role: 'OWNER' };
}

function contextFor(req: TestRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getClass: () => WidgetsController,
    getHandler: () => undefined,
  } as unknown as ExecutionContext;
}

function mockRunner(): jest.Mocked<
  Pick<
    QueryRunner,
    'connect' | 'startTransaction' | 'commitTransaction' | 'rollbackTransaction' | 'release'
  >
> & { manager: EntityManager } {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: { marker: 'tx-manager' } as unknown as EntityManager,
  };
}

const WIDGET_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function setup(handler: CallHandler) {
  const runner = mockRunner();
  const dataSource = { createQueryRunner: jest.fn(() => runner) } as unknown as DataSource;
  const transactions = new TransactionContext();
  const writer = { write: jest.fn().mockResolvedValue(undefined) };
  const interceptor = new AuditInterceptor(
    dataSource,
    transactions,
    writer as unknown as AuditWriter,
  );
  return { runner, dataSource, transactions, writer, interceptor, handler };
}

const postRequest = (): TestRequest => ({
  method: 'POST',
  url: `/projects/${PROJECT_ID}/widgets`,
  params: { projectId: PROJECT_ID },
  route: { path: '/projects/:projectId/widgets' },
  user: { id: 'user-a' },
  tenant: { userId: 'user-a', projectId: PROJECT_ID, role: 'OWNER' },
});

describe('AuditInterceptor (TASK-005, AC-006/007)', () => {
  it('passes reads through without opening a transaction', async () => {
    const { interceptor, dataSource } = setup({ handle: () => of('data') });
    const result = await lastValueFrom(
      interceptor.intercept(contextFor({ method: 'GET', url: '/x' }), { handle: () => of('data') }),
    );
    expect(result).toBe('data');
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('AC-006: wraps a state-changing request in a transaction, runs the handler inside it, and writes the audit entry before commit', async () => {
    const seen: unknown[] = [];
    const { interceptor, runner, transactions, writer } = setup({ handle: () => of(undefined) });
    const handler: CallHandler = {
      handle: () =>
        defer(() => {
          seen.push(transactions.manager); // must see the transactional manager (same tx)
          return of({ id: WIDGET_ID, name: 'w' });
        }),
    };

    const result = await lastValueFrom(interceptor.intercept(contextFor(postRequest()), handler));

    expect(result).toEqual({ id: WIDGET_ID, name: 'w' });
    expect(seen).toEqual([runner.manager]);
    expect(writer.write).toHaveBeenCalledWith(runner.manager, {
      projectId: PROJECT_ID,
      actorUserId: 'user-a',
      action: 'POST /projects/:projectId/widgets',
      entityType: 'Widgets',
      entityId: WIDGET_ID,
      metadata: { params: { projectId: PROJECT_ID } },
    });

    // write happens before commit, and the transaction commits exactly once
    expect(writer.write.mock.invocationCallOrder[0]).toBeLessThan(
      runner.commitTransaction.mock.invocationCallOrder[0],
    );
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalled();
  });

  it('rolls back when the handler fails — no orphan audit entry', async () => {
    const { interceptor, runner, writer } = setup({ handle: () => of(undefined) });
    const handler: CallHandler = { handle: () => throwError(() => new Error('domain failed')) };

    await expect(
      lastValueFrom(interceptor.intercept(contextFor(postRequest()), handler)),
    ).rejects.toThrow('domain failed');

    expect(writer.write).not.toHaveBeenCalled();
    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(runner.rollbackTransaction).toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalled();
  });

  it('AC-007: rolls back the whole transaction when the audit write itself fails', async () => {
    const { interceptor, runner, writer } = setup({ handle: () => of(undefined) });
    writer.write.mockRejectedValue(new Error('audit down'));
    const handler: CallHandler = { handle: () => of({ id: WIDGET_ID }) };

    await expect(
      lastValueFrom(interceptor.intercept(contextFor(postRequest()), handler)),
    ).rejects.toThrow('audit down');

    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(runner.rollbackTransaction).toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalled();
  });

  it('audits platform-level actions with null project/actor (nullable columns)', async () => {
    const { interceptor, writer, runner } = setup({ handle: () => of(undefined) });
    const req: TestRequest = { method: 'POST', url: '/auth/login', route: { path: '/auth/login' } };
    const handler: CallHandler = { handle: () => of({ ok: true }) };

    await lastValueFrom(interceptor.intercept(contextFor(req), handler));

    expect(writer.write).toHaveBeenCalledWith(runner.manager, {
      projectId: null,
      actorUserId: null,
      action: 'POST /auth/login',
      entityType: 'Widgets',
      entityId: null,
      metadata: null,
    });
  });
});
