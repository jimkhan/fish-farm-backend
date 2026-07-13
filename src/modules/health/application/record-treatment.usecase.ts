import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { BATCH_REPOSITORY, BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import {
  PROJECT_REPOSITORY,
  ProjectRepositoryPort,
} from '../../projects/application/ports/project-repository.port';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { Treatment } from '../domain/treatment.entity';
import { TREATMENT_REPOSITORY, TreatmentRepositoryPort } from './ports/treatment-repository.port';

export interface RecordTreatmentInput {
  readonly product: string;
  readonly dose: string;
  readonly administeredOn: Date;
  readonly withdrawalDays: number;
}

/**
 * `POST /projects/{projectId}/batches/{batchId}/treatments` (CON-051, FT-039, AC-101, R7).
 * Owner-only (module doc §2.3 — not a worker-mobile/offline flow, unlike mortality/sampling), so
 * gated by the new `canManageTreatments` capability rather than `canWrite`. Records the withdrawal
 * window; TASK-031's harvest use-case will call `Treatment.coversDate()` against
 * `TreatmentRepositoryPort.findAllForBatch()` to surface the AC-101 advisory once harvest exists
 * (this task's own non-goal is harvest itself).
 */
@Injectable()
export class RecordTreatmentUseCase {
  constructor(
    @Inject(TREATMENT_REPOSITORY) private readonly treatments: TreatmentRepositoryPort,
    @Inject(BATCH_REPOSITORY) private readonly batches: BatchRepositoryPort,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    private readonly tenant: TenantContext,
  ) {}

  async execute(batchId: string, input: RecordTreatmentInput): Promise<Treatment> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    if (project.isClosed) {
      throw new ProjectClosedError();
    }
    if (input.withdrawalDays < 0) {
      throw new ValidationError('Withdrawal days cannot be negative.');
    }

    const batch = await this.batches.findById(batchId);
    if (!batch) {
      throw new NotFoundError('Batch not found.');
    }

    const treatment = Treatment.reconstitute({
      id: randomUUID(),
      projectId: this.tenant.projectId,
      batchId,
      product: input.product,
      dose: input.dose,
      administeredOn: input.administeredOn,
      withdrawalDays: input.withdrawalDays,
      createdAt: new Date(),
    });

    return this.treatments.save(treatment);
  }
}
