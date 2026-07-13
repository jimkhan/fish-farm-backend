import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SamplingRecorded } from '@fish-farm/shared';
import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { BATCH_REPOSITORY, BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import {
  PROJECT_REPOSITORY,
  ProjectRepositoryPort,
} from '../../projects/application/ports/project-repository.port';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { Sampling } from '../domain/sampling.entity';
import { SAMPLING_REPOSITORY, SamplingRepositoryPort } from './ports/sampling-repository.port';

export interface RecordSamplingInput {
  readonly sampleSize: number;
  readonly avgWeightG: number;
  readonly sampledOn: Date;
  readonly clientMutationId: string;
}

/**
 * `POST /projects/{projectId}/batches/{batchId}/samplings` (CON-020, FT-041, AC-096, R2/R9).
 * Persists the sampling, emits `SamplingRecorded` (consumed by MOD-04's already-built
 * `OnSamplingHandler` to update the batch's latest weight for feed/biomass, AC-096's own second
 * clause). Idempotent by `client_mutation_id` (ADR-010), same pattern as TASK-028's mortality.
 */
@Injectable()
export class RecordSamplingUseCase {
  constructor(
    @Inject(SAMPLING_REPOSITORY) private readonly samplings: SamplingRepositoryPort,
    @Inject(BATCH_REPOSITORY) private readonly batches: BatchRepositoryPort,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    private readonly events: DomainEventBus,
    private readonly tenant: TenantContext,
  ) {}

  async execute(batchId: string, input: RecordSamplingInput): Promise<Sampling> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    if (project.isClosed) {
      throw new ProjectClosedError();
    }
    if (input.sampleSize <= 0 || input.avgWeightG <= 0) {
      throw new ValidationError('Sample size and average weight must be positive.');
    }

    const batch = await this.batches.findById(batchId);
    if (!batch) {
      throw new NotFoundError('Batch not found.');
    }

    const existing = await this.samplings.findByClientMutationId(input.clientMutationId);
    if (existing) {
      return existing;
    }

    const sampling = Sampling.reconstitute({
      id: randomUUID(),
      projectId: this.tenant.projectId,
      batchId,
      sampleSize: input.sampleSize,
      avgWeightG: input.avgWeightG,
      sampledOn: input.sampledOn,
      clientMutationId: input.clientMutationId,
      createdAt: new Date(),
    });
    const saved = await this.samplings.save(sampling);

    const event: SamplingRecorded = {
      name: 'SamplingRecorded',
      eventId: randomUUID(),
      occurredAt: new Date(),
      projectId: this.tenant.projectId,
      batchId,
      avgWeightG: input.avgWeightG,
    };
    await this.events.publish(event);

    return saved;
  }
}
