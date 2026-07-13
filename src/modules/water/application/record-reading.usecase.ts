import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { WaterThresholdBreached } from '@fish-farm/shared';
import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { POND_REPOSITORY, PondRepositoryPort } from '../../ponds/application/ports/pond-repository.port';
import {
  PROJECT_REPOSITORY,
  ProjectRepositoryPort,
} from '../../projects/application/ports/project-repository.port';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { BreachEvaluator } from '../domain/breach-evaluator';
import { DEFAULT_WATER_THRESHOLDS } from '../domain/default-thresholds';
import { WaterParameter } from '../domain/water-reading.entity';
import { WaterReading } from '../domain/water-reading.entity';
import {
  WATER_READING_REPOSITORY,
  WaterReadingRepositoryPort,
} from './ports/water-reading-repository.port';
import {
  WATER_THRESHOLD_REPOSITORY,
  WaterThresholdRepositoryPort,
} from './ports/water-threshold-repository.port';

export interface RecordReadingInput {
  readonly parameter: WaterParameter;
  readonly value: number;
  readonly readAt: Date;
  readonly clientMutationId: string;
}

/**
 * `POST /projects/{projectId}/ponds/{pondId}/water-readings` (CON-026, FT-032/033, AC-083/084/
 * 085/090/092/093, R1/R3/R8/R9). Always persists `source: MANUAL` (see `WaterReading`'s own
 * doc comment). Idempotent by `client_mutation_id` (ADR-010, ERD `WATER_READING.client_mutation_id
 * UK`), same pattern as TASK-028's mortality logging.
 */
@Injectable()
export class RecordReadingUseCase {
  private readonly breachEvaluator = new BreachEvaluator();

  constructor(
    @Inject(WATER_READING_REPOSITORY) private readonly readings: WaterReadingRepositoryPort,
    @Inject(WATER_THRESHOLD_REPOSITORY) private readonly thresholds: WaterThresholdRepositoryPort,
    @Inject(POND_REPOSITORY) private readonly ponds: PondRepositoryPort,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    private readonly events: DomainEventBus,
    private readonly tenant: TenantContext,
  ) {}

  async execute(pondId: string, input: RecordReadingInput): Promise<WaterReading> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    if (project.isClosed) {
      throw new ProjectClosedError();
    }

    const pond = await this.ponds.findById(pondId);
    if (!pond) {
      throw new NotFoundError('Pond not found.');
    }

    if (!Number.isFinite(input.value)) {
      throw new ValidationError('Invalid water parameter or value.');
    }

    const existing = await this.readings.findByClientMutationId(input.clientMutationId);
    if (existing) {
      return existing;
    }

    const reading = WaterReading.reconstitute({
      id: randomUUID(),
      projectId: this.tenant.projectId,
      pondId,
      parameter: input.parameter,
      value: input.value,
      source: 'MANUAL',
      deviceId: null,
      readAt: input.readAt,
      clientMutationId: input.clientMutationId,
      createdAt: new Date(),
    });
    const saved = await this.readings.save(reading);

    const configured = await this.thresholds.findByParameter(input.parameter);
    const bounds = configured ?? DEFAULT_WATER_THRESHOLDS[input.parameter];
    const severity = this.breachEvaluator.evaluate(input.value, bounds);

    if (severity) {
      const breachEvent: WaterThresholdBreached = {
        name: 'WaterThresholdBreached',
        eventId: randomUUID(),
        occurredAt: new Date(),
        projectId: this.tenant.projectId,
        sourceRef: `${pondId}:${input.parameter}`,
        severity,
        message: `${input.parameter} reading ${input.value} is out of the safe range for this pond.`,
      };
      await this.events.publish(breachEvent);
    }

    return saved;
  }
}
