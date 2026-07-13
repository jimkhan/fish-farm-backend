import { Inject, Injectable } from '@nestjs/common';
import { AlertRaised } from '@fish-farm/shared';
import { DeliveryService } from './delivery.service';
import { RecipientResolver } from './recipient-resolver';
import { ALERT_EVENT_REPOSITORY, AlertEventRepositoryPort } from './ports/alert-event-repository.port';
import { DEVICE_TOKEN_REPOSITORY, DeviceTokenRepositoryPort } from './ports/device-token-repository.port';

/**
 * F2/F3 (TASK-016/017, AC-053/052): reacts to `AlertRaised` (only published when
 * `RaiseAlertUseCase` creates a **new** alert, never on a severity uplift — R4's debounce already
 * prevents a notification storm upstream, so this handler doesn't need its own dedup). Resolves
 * recipients (R2, `RecipientResolver` from TASK-015), dispatches to each of their registered
 * devices via `DeliveryService` (TASK-017 — retry with backoff, then fallback channel, R6), and
 * drives the `RAISED→SENT` transition (the transition TASK-015 left unreachable pending TASK-016).
 * A failed delivery on every channel still moves the alert to `SENT` — "an attempt was made," per
 * R6's "never silently dropped"; `SlaEscalationScheduler` (TASK-017) is the safety net for a
 * CRITICAL alert nobody has acknowledged, independent of whether the initial push landed.
 */
@Injectable()
export class OnAlertRaisedHandler {
  constructor(
    private readonly delivery: DeliveryService,
    @Inject(DEVICE_TOKEN_REPOSITORY) private readonly devices: DeviceTokenRepositoryPort,
    @Inject(ALERT_EVENT_REPOSITORY) private readonly alerts: AlertEventRepositoryPort,
    private readonly recipients: RecipientResolver,
  ) {}

  async handle(event: AlertRaised): Promise<void> {
    const userIds = await this.recipients.resolve(event.projectId, event.alertType);
    const tokensByUser = await Promise.all(userIds.map((userId) => this.devices.findByUserId(userId)));
    const tokens = tokensByUser.flat();

    for (const token of tokens) {
      await this.delivery.deliver(event.alertId, token.fcmToken, {
        title: `${event.alertType} — ${event.severity}`,
        body: event.alertType === 'WATER_EMERGENCY' ? 'Emergency water event raised.' : 'A new alert was raised.',
        data: { alertId: event.alertId, projectId: event.projectId },
      });
    }

    const alert = await this.alerts.findById(event.alertId);
    if (alert && alert.state === 'RAISED') {
      await this.alerts.save(alert.transitionTo('SENT'));
    }
  }
}
