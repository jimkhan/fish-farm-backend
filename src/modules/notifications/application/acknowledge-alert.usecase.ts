import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AlertAcknowledged } from '@fish-farm/shared';
import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { ForbiddenError, NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { Alert } from '../domain/alert.entity';
import { ALERT_REPOSITORY, AlertRepositoryPort } from './ports/alert-repository.port';

/**
 * `POST /projects/{projectId}/alerts/{alertId}/acknowledge` (CON-039, AC-051/059, R7/R8).
 * Owner may acknowledge any alert; Worker only operational types; Partner never (`Alert.
 * canBeAcknowledgedBy`). Idempotent — acknowledging an already-acknowledged/resolved alert is a
 * no-op that returns current state (edge case 4), enforced by `Alert.acknowledge()` itself.
 */
@Injectable()
export class AcknowledgeAlertUseCase {
  constructor(
    @Inject(ALERT_REPOSITORY) private readonly alerts: AlertRepositoryPort,
    private readonly events: DomainEventBus,
    private readonly tenant: TenantContext,
  ) {}

  async execute(alertId: string): Promise<Alert> {
    const alert = await this.alerts.findById(alertId);
    if (!alert) {
      throw new NotFoundError('Alert not found.');
    }

    if (!alert.canBeAcknowledgedBy(this.tenant.role)) {
      throw new ForbiddenError(
        this.tenant.role === 'PARTNER' ? 'Partners have read-only access.' : undefined,
      );
    }

    const wasAlreadyAcknowledged = alert.state === 'ACKNOWLEDGED' || alert.state === 'RESOLVED';
    const acknowledged = alert.acknowledge();
    if (wasAlreadyAcknowledged) {
      return acknowledged;
    }

    const saved = await this.alerts.save(acknowledged);

    const event: AlertAcknowledged = {
      name: 'AlertAcknowledged',
      eventId: randomUUID(),
      occurredAt: new Date(),
      projectId: saved.projectId,
      alertId: saved.id,
    };
    await this.events.publish(event);

    return saved;
  }
}
