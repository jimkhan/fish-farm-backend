import { Alert } from '../../domain/alert.entity';

/** Tenant-scoped (ADR-006) — for the request-driven list/acknowledge use-cases. */
export interface AlertRepositoryPort {
  findAllInCurrentProject(): Promise<Alert[]>;
  findById(alertId: string): Promise<Alert | null>;
  /**
   * TASK-024: looks up an alert by its dedup key (`Alert.dedupKey`) within the current scope —
   * used by `RaiseEmergencyUseCase` to return the real, current alert (fresh or absorbed into an
   * already-active one) right after `RaiseAlertUseCase` has synchronously processed it via the
   * awaited `DomainEventBus.publish()` call.
   */
  findByDedupKey(dedupKey: string): Promise<Alert | null>;
  save(alert: Alert): Promise<Alert>;
}

export const ALERT_REPOSITORY = 'AlertRepositoryPort';
