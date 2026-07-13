import { Alert } from '../../domain/alert.entity';

/**
 * Unscoped, by explicit `projectId` (TASK-015). Used only by `RaiseAlertUseCase`, which runs on
 * `DomainEventBus` delivery — not inside an HTTP request — so there is no `TenantContext` to
 * scope through (the same exception class as `BatchEventRepositoryPort`, TASK-019).
 */
export interface AlertEventRepositoryPort {
  /** The active (non-`RESOLVED`) alert with this dedup key in this project, if any (R4/R5). */
  findActiveByDedupKey(projectId: string, dedupKey: string): Promise<Alert | null>;
  /** TASK-016: looks up the just-raised alert by id to drive the `RAISED→SENT` transition. */
  findById(alertId: string): Promise<Alert | null>;
  /**
   * TASK-017/R7: every CRITICAL alert not yet `ACKNOWLEDGED`/`RESOLVED`, raised before
   * `threshold` (i.e. past the SLA window), and not yet escalated — across every project, since
   * `SlaEscalationScheduler` runs on a timer, not inside an HTTP request.
   */
  findCriticalUnacknowledgedPastSla(threshold: Date): Promise<Alert[]>;
  save(alert: Alert): Promise<Alert>;
}

export const ALERT_EVENT_REPOSITORY = 'AlertEventRepositoryPort';
