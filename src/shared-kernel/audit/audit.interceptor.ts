import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Observable, defer, lastValueFrom } from 'rxjs';
import type { DataSource } from 'typeorm';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { TenantState } from '../tenant/tenant-context';
import { AuditWriter } from './audit.writer';

/** Request slice the interceptor reads. `user` from MOD-02's auth, `tenant` from the guard. */
interface AuditedRequest {
  method: string;
  url: string;
  params?: Record<string, string>;
  route?: { path?: string };
  user?: { id: string };
  tenant?: TenantState;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Best-effort id of the touched entity: created resource's id, else the `:id` route param. */
function extractEntityId(result: unknown, params?: Record<string, string>): string | null {
  const fromResult =
    typeof result === 'object' && result !== null ? (result as { id?: unknown }).id : undefined;
  if (typeof fromResult === 'string' && UUID_RE.test(fromResult)) return fromResult;
  const fromParams = params?.id;
  return typeof fromParams === 'string' && UUID_RE.test(fromParams) ? fromParams : null;
}

/**
 * Global audit interceptor (TASK-005, FT-005, AC-006/007, NFR-012). Every state-changing
 * request (POST/PUT/PATCH/DELETE) runs inside one DB transaction: the handler executes with
 * that transaction bound to `TransactionContext` (so every `ScopedRepository` write joins it),
 * and on success the `AuditEntry` is written **before commit**. Any failure — the handler's or
 * the audit write's own — rolls the whole transaction back: no orphan state, no orphan audit.
 * Reads (GET/HEAD/OPTIONS) pass through untouched.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private static readonly AUDITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly transactions: TransactionContext,
    private readonly auditWriter: AuditWriter,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuditedRequest>();
    if (!AuditInterceptor.AUDITED_METHODS.has(request.method)) {
      return next.handle();
    }
    return defer(() => this.runAudited(context, request, next));
  }

  private async runAudited(
    context: ExecutionContext,
    request: AuditedRequest,
    next: CallHandler,
  ): Promise<unknown> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const result = await this.transactions.run(queryRunner.manager, () =>
        lastValueFrom(next.handle(), { defaultValue: undefined }),
      );

      await this.auditWriter.write(queryRunner.manager, {
        projectId: request.tenant?.projectId ?? null,
        actorUserId: request.user?.id ?? null,
        // The route pattern (`:projectId`), not the raw URL — concrete ids go to entity_id.
        action: `${request.method} ${request.route?.path ?? request.url}`,
        entityType: context.getClass().name.replace(/Controller$/, ''),
        entityId: extractEntityId(result, request.params),
        metadata:
          request.params && Object.keys(request.params).length > 0
            ? { params: request.params }
            : null,
      });

      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
