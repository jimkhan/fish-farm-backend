import { Inject, Injectable } from '@nestjs/common';
import { SamplingRecorded } from '@fish-farm/shared';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import {
  BATCH_EVENT_REPOSITORY,
  BatchEventRepositoryPort,
} from './ports/batch-event-repository.port';

/** Reacts to `SamplingRecorded` (MOD-07) to update the latest weight (TASK-019, MOD-04 F3, AC-066). */
@Injectable()
export class OnSamplingHandler {
  constructor(
    @Inject(BATCH_EVENT_REPOSITORY) private readonly batches: BatchEventRepositoryPort,
  ) {}

  async handle(event: SamplingRecorded): Promise<void> {
    const batch = await this.batches.findById(event.batchId);
    if (!batch) {
      throw new NotFoundError(`Batch ${event.batchId} not found for SamplingRecorded.`);
    }
    await this.batches.save(batch.applySampling(event.avgWeightG));
  }
}
