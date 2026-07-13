import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AbnormalMortalityDetected, MortalityRecorded } from '@fish-farm/shared';
import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { BATCH_REPOSITORY, BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import {
  PROJECT_REPOSITORY,
  ProjectRepositoryPort,
} from '../../projects/application/ports/project-repository.port';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { Mortality } from '../domain/mortality.entity';
import { SpikeDetector } from '../domain/spike-detector';
import { MORTALITY_REPOSITORY, MortalityRepositoryPort } from './ports/mortality-repository.port';

export interface LogMortalityInput {
  readonly count: number;
  readonly causeCategory: string;
  readonly photoUrl?: string;
  readonly occurredAt: Date;
  readonly clientMutationId: string;
}

/**
 * `POST /projects/{projectId}/batches/{batchId}/mortalities` (CON-019, FT-038, AC-094/095/100/105,
 * R1/R6). Persists the mortality, emits `MortalityRecorded` (consumed by MOD-04's survival/biomass
 * read-model, AC-095), then runs spike detection (F3) and — if today's total for this batch
 * exceeds the trailing baseline — emits `AbnormalMortalityDetected` (consumed by MOD-09's already-
 * built alert handler, AC-100).
 */
@Injectable()
export class LogMortalityUseCase {
  private readonly spikeDetector = new SpikeDetector();

  constructor(
    @Inject(MORTALITY_REPOSITORY) private readonly mortalities: MortalityRepositoryPort,
    @Inject(BATCH_REPOSITORY) private readonly batches: BatchRepositoryPort,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    private readonly events: DomainEventBus,
    private readonly tenant: TenantContext,
  ) {}

  async execute(batchId: string, input: LogMortalityInput): Promise<Mortality> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    if (project.isClosed) {
      throw new ProjectClosedError();
    }
    if (input.count <= 0) {
      throw new ValidationError('Count must be positive.');
    }

    // Edge case: a batchId from another project resolves to null (ScopedRepository) — never
    // discloses whether it exists elsewhere (AC-105).
    const batch = await this.batches.findById(batchId);
    if (!batch) {
      throw new NotFoundError('Batch not found.');
    }

    // ADR-010: idempotent by clientMutationId — a replayed offline mutation never duplicates,
    // never re-emits events, and never double-counts toward spike detection.
    const existing = await this.mortalities.findByClientMutationId(input.clientMutationId);
    if (existing) {
      return existing;
    }

    const mortality = Mortality.reconstitute({
      id: randomUUID(),
      projectId: this.tenant.projectId,
      batchId,
      count: input.count,
      causeCategory: input.causeCategory,
      photoUrl: input.photoUrl ?? null,
      occurredAt: input.occurredAt,
      clientMutationId: input.clientMutationId,
      createdAt: new Date(),
    });
    const saved = await this.mortalities.save(mortality);

    const mortalityEvent: MortalityRecorded = {
      name: 'MortalityRecorded',
      eventId: randomUUID(),
      occurredAt: new Date(),
      projectId: this.tenant.projectId,
      batchId,
      count: input.count,
    };
    await this.events.publish(mortalityEvent);

    const dayStart = new Date(
      Date.UTC(
        input.occurredAt.getUTCFullYear(),
        input.occurredAt.getUTCMonth(),
        input.occurredAt.getUTCDate(),
      ),
    );
    const windowStart = new Date(dayStart.getTime() - 7 * 86_400_000);
    const windowEnd = new Date(dayStart.getTime() + 86_400_000);
    const recentRecords = await this.mortalities.findForBatchBetween(batchId, windowStart, windowEnd);

    if (this.spikeDetector.isSpike(recentRecords, input.occurredAt)) {
      const spikeEvent: AbnormalMortalityDetected = {
        name: 'AbnormalMortalityDetected',
        eventId: randomUUID(),
        occurredAt: new Date(),
        projectId: this.tenant.projectId,
        sourceRef: batchId,
        message: `Mortality spike detected for batch ${batchId}.`,
      };
      await this.events.publish(spikeEvent);
    }

    return saved;
  }
}
