import { Inject, Injectable } from '@nestjs/common';
import { HarvestRecorded } from '@fish-farm/shared';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import {
  BATCH_EVENT_REPOSITORY,
  BatchEventRepositoryPort,
} from './ports/batch-event-repository.port';

/** Reacts to `HarvestRecorded` (MOD-07) to reduce remaining count/biomass (TASK-019, MOD-04 F3, AC-067). */
@Injectable()
export class OnHarvestHandler {
  constructor(
    @Inject(BATCH_EVENT_REPOSITORY) private readonly batches: BatchEventRepositoryPort,
  ) {}

  async handle(event: HarvestRecorded): Promise<void> {
    const batch = await this.batches.findById(event.batchId);
    if (!batch) {
      throw new NotFoundError(`Batch ${event.batchId} not found for HarvestRecorded.`);
    }
    await this.batches.save(batch.applyHarvest(event.count));
  }
}
