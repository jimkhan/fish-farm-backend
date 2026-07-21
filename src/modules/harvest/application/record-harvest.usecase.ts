import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { HarvestRecorded, HarvestRevenueEarned } from '@fish-farm/shared';
import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { BATCH_REPOSITORY, BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import {
  PROJECT_REPOSITORY,
  ProjectRepositoryPort,
} from '../../projects/application/ports/project-repository.port';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import {
  TREATMENT_REPOSITORY,
  TreatmentRepositoryPort,
} from '../../health/application/ports/treatment-repository.port';
import { Harvest, HarvestGrade } from '../domain/harvest.entity';
import { HarvestExceedsStockError } from '../domain/harvest-errors';
import { HARVEST_REPOSITORY, HarvestRepositoryPort } from './ports/harvest-repository.port';

export interface RecordHarvestInput {
  readonly quantity: number;
  readonly totalWeightKg: number;
  readonly grade: HarvestGrade;
  readonly harvestedOn: Date;
  readonly revenueMinor?: number;
  readonly clientMutationId: string;
}

export interface RecordHarvestResult {
  readonly harvest: Harvest;
  readonly withdrawalWarning: boolean;
}

/**
 * `POST /projects/{projectId}/batches/{batchId}/harvests` (CON-021, F7, AC-102/103/106, R7/R8/
 * R9). Gated `canWrite` (module doc §2.3 — Worker mobile records harvests; Partners read-only).
 *
 * R8/AC-103: `quantity` (a hard count) is checked against `Batch.survivalEstimate` — `totalWeightKg`
 * is NOT checked against the estimated biomass, since it's a real measured weight at harvest time
 * and the biomass estimate (`survivalEstimate × latestAvgWeightG`) is only a projection between
 * samplings; blocking on it would reject genuine data using a stale guess.
 *
 * R7/AC-101 (this task's own harvest use-case is the wiring TASK-028's `Treatment.coversDate()`
 * was built anticipating — its own doc comment says so explicitly): an EXPORT-grade harvest whose
 * date falls inside any treatment's withdrawal window is **not blocked** — the error table's own
 * shape is "200 + flag," not a 4xx — `withdrawalWarning` is surfaced on the response instead.
 *
 * Publishes `HarvestRecorded` (→ MOD-04, reduces `Batch.harvestedCount`, already-built consumer)
 * and, only when revenue is actually provided (it's optional — a harvest can be recorded before
 * its sale price is known), `HarvestRevenueEarned` (→ MOD-08, not yet built — ADR-015: this module
 * defines the contract as first publisher).
 */
@Injectable()
export class RecordHarvestUseCase {
  constructor(
    @Inject(BATCH_REPOSITORY) private readonly batches: BatchRepositoryPort,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    @Inject(TREATMENT_REPOSITORY) private readonly treatments: TreatmentRepositoryPort,
    @Inject(HARVEST_REPOSITORY) private readonly harvests: HarvestRepositoryPort,
    private readonly events: DomainEventBus,
    private readonly tenant: TenantContext,
  ) {}

  async execute(batchId: string, input: RecordHarvestInput): Promise<RecordHarvestResult> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    if (project.isClosed) {
      throw new ProjectClosedError();
    }
    if (input.quantity <= 0 || input.totalWeightKg <= 0) {
      throw new ValidationError('Quantity and weight must be positive.');
    }

    // Edge case: a batchId from another project resolves to null (ScopedRepository) — never
    // discloses whether it exists elsewhere, same anti-enumeration shape as every other module.
    const batch = await this.batches.findById(batchId);
    if (!batch) {
      throw new NotFoundError('Batch not found.');
    }

    // ADR-010: idempotent by clientMutationId — a replayed mutation never double-harvests.
    let harvest = await this.harvests.findByClientMutationId(input.clientMutationId);
    if (!harvest) {
      if (input.quantity > batch.survivalEstimate) {
        throw new HarvestExceedsStockError();
      }

      const newHarvest = Harvest.reconstitute({
        id: randomUUID(),
        projectId: this.tenant.projectId,
        batchId,
        quantity: input.quantity,
        totalWeightKg: input.totalWeightKg,
        grade: input.grade,
        harvestedOn: input.harvestedOn,
        revenueMinor: input.revenueMinor ?? null,
        clientMutationId: input.clientMutationId,
        createdAt: new Date(),
      });
      harvest = await this.harvests.save(newHarvest);

      const harvestEvent: HarvestRecorded = {
        name: 'HarvestRecorded',
        eventId: randomUUID(),
        occurredAt: new Date(),
        batchId,
        count: input.quantity,
      };
      await this.events.publish(harvestEvent);

      if (input.revenueMinor !== undefined) {
        const revenueEvent: HarvestRevenueEarned = {
          name: 'HarvestRevenueEarned',
          eventId: randomUUID(),
          occurredAt: new Date(),
          projectId: this.tenant.projectId,
          batchId,
          harvestId: harvest.id,
          revenueMinor: input.revenueMinor,
        };
        await this.events.publish(revenueEvent);
      }
    }

    const savedHarvest = harvest;
    const treatments = await this.treatments.findAllForBatch(batchId);
    const withdrawalWarning =
      savedHarvest.grade === 'EXPORT' &&
      treatments.some((t) => t.coversDate(savedHarvest.harvestedOn));

    return { harvest: savedHarvest, withdrawalWarning };
  }
}
