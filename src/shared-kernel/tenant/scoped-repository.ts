import { FindOptionsOrder, FindOptionsWhere, Repository } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../platform/persistence/base-project-owned.persistence-model';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { TenantContext } from './tenant-context';

/**
 * Read-shaping options for {@link ScopedRepository.find}. Ordering and bounding belong here
 * rather than in each caller because this base is the *only* sanctioned path to project-owned
 * data (MOD-01 R2) — a module that needs a sorted or bounded read must not drop to a raw
 * repository or sort the whole table in memory to get one.
 */
export interface ScopedFindOptions<T> {
  /** SQL-level ordering. Without it, row order is undefined — never rely on insertion order. */
  order?: FindOptionsOrder<T>;
  /** Max rows to return (SQL `LIMIT`). */
  take?: number;
  /** Rows to skip (SQL `OFFSET`). */
  skip?: number;
}

/**
 * The only sanctioned data path to project-owned tables (TASK-004, FT-004, ADR-006, R2).
 *
 * Every read is composed with `project_id = TenantContext.projectId` and every write is
 * stamped with it — a client-supplied `projectId` on the entity is overwritten, never trusted
 * (AC-014, R3). Because `TenantContext.projectId` throws `ScopeRequiredError` when the guard
 * has not populated the scope, an unscoped call fails before any query runs (AC-005).
 *
 * Modules construct one per persistence model in their infrastructure layer:
 * `new ScopedRepository(dataSource.getRepository(XPersistenceModel), tenantContext)` inside a
 * request-scoped provider. Raw `Repository`/query-builder access to project-owned tables is
 * forbidden (MOD-01 R2); a query shape this base does not cover must add an explicitly scoped
 * method here rather than bypassing it (MOD-01 §6.3).
 */
export class ScopedRepository<T extends BaseProjectOwnedPersistenceModel> {
  constructor(
    private readonly repository: Repository<T>,
    private readonly tenant: TenantContext,
    // When the audit interceptor has a request transaction open (TASK-005), all scoped work
    // joins it so the domain write and its audit entry commit or roll back together.
    private readonly transactions?: TransactionContext,
  ) {}

  /** The repository to use right now: the request transaction's, or the base one. */
  private get repo(): Repository<T> {
    const manager = this.transactions?.manager;
    return manager ? manager.getRepository(this.repository.target) : this.repository;
  }

  /** Composes the tenant filter into a where clause; throws if no scope is bound. */
  private scoped(where?: FindOptionsWhere<T>): FindOptionsWhere<T> {
    return { ...(where ?? {}), projectId: this.tenant.projectId } as FindOptionsWhere<T>;
  }

  async find(where?: FindOptionsWhere<T>, options?: ScopedFindOptions<T>): Promise<T[]> {
    return this.repo.find({
      where: this.scoped(where),
      ...(options?.order !== undefined && { order: options.order }),
      ...(options?.take !== undefined && { take: options.take }),
      ...(options?.skip !== undefined && { skip: options.skip }),
    });
  }

  /** First match under `options.order` — a bounded `LIMIT 1` read, not a full-table fetch. */
  async findOne(where?: FindOptionsWhere<T>, options?: ScopedFindOptions<T>): Promise<T | null> {
    const [model] = await this.find(where, { ...options, take: 1 });
    return model ?? null;
  }

  async findOneById(id: string): Promise<T | null> {
    return this.repo.findOne({ where: this.scoped({ id } as FindOptionsWhere<T>) });
  }

  async count(where?: FindOptionsWhere<T>): Promise<number> {
    return this.repo.count({ where: this.scoped(where) });
  }

  /** Persists the entity with `project_id` from TenantContext — any preset value is ignored. */
  async save(entity: T): Promise<T> {
    entity.projectId = this.tenant.projectId;
    return this.repo.save(entity);
  }

  /** Deletes by id within the tenant scope; returns whether a row was actually removed. */
  async deleteById(id: string): Promise<boolean> {
    const result = await this.repo.delete(this.scoped({ id } as FindOptionsWhere<T>));
    return (result.affected ?? 0) > 0;
  }
}
