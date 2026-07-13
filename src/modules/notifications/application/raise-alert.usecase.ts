import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AlertRaised } from '@fish-farm/shared';
import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { Alert, AlertSeverity, AlertType } from '../domain/alert.entity';
import {
  ALERT_EVENT_REPOSITORY,
  AlertEventRepositoryPort,
} from './ports/alert-event-repository.port';

export interface RaiseAlertInput {
  readonly projectId: string;
  readonly type: AlertType;
  readonly severity: AlertSeverity;
  readonly sourceRef: string;
  readonly message: string;
}

/**
 * Reacts to a subscribed domain event to raise/uplift an alert (TASK-015, MOD-09 F1, AC-050/055/
 * 058, R4/R5). Runs on `DomainEventBus` delivery, not inside an HTTP request.
 *
 * Idempotent by dedup key (`projectId:type:sourceRef`), not by event id — durably so, since the
 * check is a DB lookup rather than an in-process set (TASK-006's `idempotentConsumer()` only
 * protects one process's lifetime). Both a literal redelivery of the same event (AC-058) and a
 * genuinely repeated breach report (AC-055) collapse into the same existing active alert; a
 * higher-severity repeat uplifts it in place (R4 "create/uplift") instead of creating a duplicate.
 *
 * Doesn't call `RecipientResolver` — that's the delivery-target computation TASK-016's dispatch
 * use-case will consume; calling it here and discarding the result would be dead work.
 */
@Injectable()
export class RaiseAlertUseCase {
  constructor(
    @Inject(ALERT_EVENT_REPOSITORY) private readonly alerts: AlertEventRepositoryPort,
    private readonly events: DomainEventBus,
  ) {}

  async execute(input: RaiseAlertInput): Promise<Alert> {
    const dedupKey = Alert.dedupKey(input.projectId, input.type, input.sourceRef);
    const existing = await this.alerts.findActiveByDedupKey(input.projectId, dedupKey);

    if (existing) {
      const uplifted = existing.upliftSeverity(input.severity);
      return uplifted === existing ? existing : this.alerts.save(uplifted);
    }

    const alert = Alert.reconstitute({
      id: randomUUID(),
      projectId: input.projectId,
      type: input.type,
      severity: input.severity,
      state: 'RAISED',
      message: input.message,
      sourceRef: input.sourceRef,
      raisedAt: new Date(),
      acknowledgedAt: null,
      resolvedAt: null,
      escalatedAt: null,
    });
    const saved = await this.alerts.save(alert);

    const event: AlertRaised = {
      name: 'AlertRaised',
      eventId: randomUUID(),
      occurredAt: new Date(),
      projectId: saved.projectId,
      alertId: saved.id,
      alertType: saved.type,
      severity: saved.severity,
    };
    await this.events.publish(event);

    return saved;
  }
}
