import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeliveryService } from './delivery.service';
import { RecipientResolver } from './recipient-resolver';
import { ALERT_EVENT_REPOSITORY, AlertEventRepositoryPort } from './ports/alert-event-repository.port';
import { DEVICE_TOKEN_REPOSITORY, DeviceTokenRepositoryPort } from './ports/device-token-repository.port';

/** R7's own SLA target — module doc's open question resolved to its own stated default ("assumed
 * 15 min for CRITICAL"). */
export const CRITICAL_SLA_MINUTES = 15;

/**
 * F3 (TASK-017, R7, AC-054): scans every project's CRITICAL alerts still unacknowledged past the
 * SLA and re-notifies via the same recipient-resolution + `DeliveryService` retry/fallback path as
 * the initial raise (TASK-016). Escalates **exactly once** per alert (`Alert.escalate()` is
 * idempotent) — a documented, non-spamming reading of "re-notify/escalate" the module doc doesn't
 * pin to a repeating cadence. Acknowledging an alert removes it from this query's result set
 * entirely (state filter), which is how "acknowledging... stops escalation" (AC-054) is satisfied
 * — no separate cancellation path is needed.
 */
@Injectable()
export class SlaEscalationScheduler {
  constructor(
    @Inject(ALERT_EVENT_REPOSITORY) private readonly alerts: AlertEventRepositoryPort,
    @Inject(DEVICE_TOKEN_REPOSITORY) private readonly devices: DeviceTokenRepositoryPort,
    private readonly recipients: RecipientResolver,
    private readonly delivery: DeliveryService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async scan(): Promise<void> {
    const threshold = new Date(Date.now() - CRITICAL_SLA_MINUTES * 60_000);
    const overdue = await this.alerts.findCriticalUnacknowledgedPastSla(threshold);

    for (const alert of overdue) {
      const userIds = await this.recipients.resolve(alert.projectId, alert.type);
      const tokensByUser = await Promise.all(userIds.map((userId) => this.devices.findByUserId(userId)));
      const tokens = tokensByUser.flat();

      for (const token of tokens) {
        await this.delivery.deliver(alert.id, token.fcmToken, {
          title: `${alert.type} — CRITICAL (unacknowledged)`,
          body: alert.message,
          data: { alertId: alert.id, projectId: alert.projectId, escalation: 'true' },
        });
      }

      await this.alerts.save(alert.escalate());
    }
  }
}
