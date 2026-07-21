/** `SyncRequest.mutations[].entity` (contracts/openapi.yaml, CON-040). */
export type SyncEntityType =
  | 'FEEDING_LOG'
  | 'MORTALITY'
  | 'WATER_READING'
  | 'TASK_LOG'
  | 'WATER_EVENT'
  | 'SAMPLING'
  | 'POND_ACTION';

/** ERD `SYNC_MUTATION.status`. `CONFLICT` is modeled for forward-compatibility (a future `op:
 * UPDATE` on a mutable entity) — unreachable today since `op` is `CREATE`-only (R5/AC-131, every
 * synced entity is append-only). */
export type SyncMutationStatus = 'SYNCED' | 'CONFLICT' | 'FAILED';

/**
 * Pure domain `SyncMutation` (TASK-040, MOD-12 §4.3, ERD `SYNC_MUTATION`). `clientMutationId`
 * (minted offline, ADR-016) is the primary key, matching ERD exactly — one row per mutation ever
 * attempted, upserted on retry. A `FAILED` row is **not terminal**: the next replay of the same
 * `clientMutationId` re-attempts dispatch (AC-137's "failed ones remain queued for retry") and
 * this row is overwritten with whatever the new attempt resolves to; only `SYNCED`/`CONFLICT` are
 * terminal (a replay of either just returns the stored result, never re-dispatches).
 */
export interface SyncMutationProps {
  readonly clientMutationId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly entity: SyncEntityType;
  readonly status: SyncMutationStatus;
  readonly serverId: string | null;
  readonly processedAt: Date;
}

export class SyncMutation {
  private constructor(private readonly props: SyncMutationProps) {}

  static reconstitute(props: SyncMutationProps): SyncMutation {
    return new SyncMutation(props);
  }

  get clientMutationId(): string {
    return this.props.clientMutationId;
  }

  get projectId(): string {
    return this.props.projectId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get entity(): SyncEntityType {
    return this.props.entity;
  }

  get status(): SyncMutationStatus {
    return this.props.status;
  }

  get serverId(): string | null {
    return this.props.serverId;
  }

  get processedAt(): Date {
    return this.props.processedAt;
  }

  get isTerminal(): boolean {
    return this.props.status !== 'FAILED';
  }
}
