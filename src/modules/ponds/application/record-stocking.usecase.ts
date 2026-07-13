import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { BatchCreated, StockingRecorded } from '@fish-farm/shared';
import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import {
  PROJECT_REPOSITORY,
  ProjectRepositoryPort,
} from '../../projects/application/ports/project-repository.port';
import { Batch } from '../domain/batch.entity';
import { Stocking, StockingSource } from '../domain/stocking.entity';
import { BATCH_REPOSITORY, BatchRepositoryPort } from './ports/batch-repository.port';
import { POND_REPOSITORY, PondRepositoryPort } from './ports/pond-repository.port';
import { SPECIES_REPOSITORY, SpeciesRepositoryPort } from './ports/species-repository.port';
import { STOCKING_REPOSITORY, StockingRepositoryPort } from './ports/stocking-repository.port';

export interface RecordStockingInput {
  readonly speciesId: string;
  readonly source?: StockingSource;
  readonly hatcheryName?: string;
  readonly count: number;
  readonly stockedOn: Date;
  readonly stockingCostMinor?: number;
}

/**
 * `POST /projects/{projectId}/ponds/{pondId}/stockings` (CON-015, FT-019, AC-062/070, R2/R3/R7).
 * Creates exactly one `Batch` per `Stocking` (R3) in one call — both persisted through the
 * request's ambient transaction (TASK-005), so a failure on either side leaves neither behind.
 */
@Injectable()
export class RecordStockingUseCase {
  constructor(
    @Inject(POND_REPOSITORY) private readonly ponds: PondRepositoryPort,
    @Inject(SPECIES_REPOSITORY) private readonly species: SpeciesRepositoryPort,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    @Inject(STOCKING_REPOSITORY) private readonly stockings: StockingRepositoryPort,
    @Inject(BATCH_REPOSITORY) private readonly batches: BatchRepositoryPort,
    private readonly events: DomainEventBus,
    private readonly tenant: TenantContext,
  ) {}

  async execute(pondId: string, input: RecordStockingInput): Promise<Batch> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    if (project.isClosed) {
      throw new ProjectClosedError();
    }

    // Edge case 1: a pondId from another project resolves to null (ScopedRepository) — never
    // discloses whether it exists elsewhere.
    const pond = await this.ponds.findById(pondId);
    if (!pond) {
      throw new NotFoundError('Pond not found.');
    }

    const allSpecies = await this.species.findAll();
    if (!allSpecies.some((s) => s.id === input.speciesId)) {
      throw new ValidationError('Unknown species.');
    }
    if (input.count <= 0) {
      throw new ValidationError('Area and count must be positive.');
    }

    const stocking = Stocking.reconstitute({
      id: randomUUID(),
      projectId: this.tenant.projectId,
      pondId,
      speciesId: input.speciesId,
      source: input.source ?? null,
      hatcheryName: input.hatcheryName ?? null,
      count: input.count,
      stockedOn: input.stockedOn,
      stockingCostMinor: input.stockingCostMinor ?? null,
      currency: input.stockingCostMinor !== undefined ? 'BDT' : null,
      createdAt: new Date(),
    });
    const savedStocking = await this.stockings.save(stocking);

    const batch = Batch.reconstitute({
      id: randomUUID(),
      projectId: this.tenant.projectId,
      pondId,
      stockingId: savedStocking.id,
      speciesId: input.speciesId,
      initialCount: input.count,
      cumulativeMortality: 0,
      harvestedCount: 0,
      latestAvgWeightG: null,
      status: 'ACTIVE',
      stockedOn: input.stockedOn,
      createdAt: new Date(),
    });
    const savedBatch = await this.batches.save(batch);

    const stockingEvent: StockingRecorded = {
      name: 'StockingRecorded',
      eventId: randomUUID(),
      occurredAt: new Date(),
      projectId: this.tenant.projectId,
      stockingId: savedStocking.id,
      batchId: savedBatch.id,
      pondId,
      speciesId: input.speciesId,
    };
    await this.events.publish(stockingEvent);

    const batchEvent: BatchCreated = {
      name: 'BatchCreated',
      eventId: randomUUID(),
      occurredAt: new Date(),
      projectId: this.tenant.projectId,
      batchId: savedBatch.id,
      pondId,
      speciesId: input.speciesId,
      initialCount: input.count,
    };
    await this.events.publish(batchEvent);

    return savedBatch;
  }
}
