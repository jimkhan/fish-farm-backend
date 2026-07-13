import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { WaterEmergencyRaised } from '@fish-farm/shared';
import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { POND_REPOSITORY, PondRepositoryPort } from '../../ponds/application/ports/pond-repository.port';
import {
  PROJECT_REPOSITORY,
  ProjectRepositoryPort,
} from '../../projects/application/ports/project-repository.port';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { Alert } from '../../notifications/domain/alert.entity';
import { ALERT_REPOSITORY, AlertRepositoryPort } from '../../notifications/application/ports/alert-repository.port';

export interface RaiseEmergencyInput {
  readonly pondId?: string;
  readonly note?: string;
}

/**
 * `POST /projects/{projectId}/water-events` (CON-028, FT-036, AC-086, R4/R8). "Independent of any
 * reading" (module doc F5) — no `WaterReading` is required or created; `pondId`/`note` are both
 * optional in `CreateWaterEvent` (contracts/openapi.yaml carries no `required` array at all),
 * matching edge case 3's "emergency raised with no reading" (and, by the same logic, no pond).
 * When no pond is given, the project itself is the dedup `sourceRef` — still a real, stable key
 * (MOD-09 R5), just project-wide instead of pond-specific.
 *
 * No separate idempotency tracking is needed for a repeated tap: `RaiseAlertUseCase`'s own
 * dedup-by-`(projectId, type, sourceRef)` already collapses a second tap on the same pond/project
 * into the existing active alert (MOD-09 R4/edge case 7) — exactly the "no notification storm"
 * behavior a genuine double-tap should have.
 */
@Injectable()
export class RaiseEmergencyUseCase {
  constructor(
    @Inject(POND_REPOSITORY) private readonly ponds: PondRepositoryPort,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    @Inject(ALERT_REPOSITORY) private readonly alerts: AlertRepositoryPort,
    private readonly events: DomainEventBus,
    private readonly tenant: TenantContext,
  ) {}

  async execute(input: RaiseEmergencyInput): Promise<Alert> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    if (project.isClosed) {
      throw new ProjectClosedError();
    }

    if (input.pondId !== undefined) {
      const pond = await this.ponds.findById(input.pondId);
      if (!pond) {
        throw new NotFoundError('Pond not found.');
      }
    }

    const sourceRef = input.pondId ?? this.tenant.projectId;
    const event: WaterEmergencyRaised = {
      name: 'WaterEmergencyRaised',
      eventId: randomUUID(),
      occurredAt: new Date(),
      projectId: this.tenant.projectId,
      sourceRef,
      message: input.note ?? 'Emergency raised by a worker — no additional details provided.',
    };
    // DomainEventBus.publish() awaits every handler, so by the time this resolves,
    // OnWaterEmergencyRaisedHandler -> RaiseAlertUseCase (-> OnAlertRaisedHandler dispatch) has
    // already run synchronously; the resulting alert is queryable immediately after.
    await this.events.publish(event);

    const dedupKey = Alert.dedupKey(this.tenant.projectId, 'WATER_EMERGENCY', sourceRef);
    const alert = await this.alerts.findByDedupKey(dedupKey);
    if (!alert) {
      throw new Error('Emergency alert was not found immediately after being raised.');
    }
    return alert;
  }
}
