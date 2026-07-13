import { Inject, Injectable } from '@nestjs/common';
import { MortalityRecorded } from '@fish-farm/shared';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import {
  BATCH_EVENT_REPOSITORY,
  BatchEventRepositoryPort,
} from './ports/batch-event-repository.port';

/**
 * Reacts to `MortalityRecorded` (MOD-07, not built yet) to maintain the survival read-model
 * (TASK-019, MOD-04 F3, AC-063). Wrapped in `idempotentConsumer()` where subscribed — this class
 * itself assumes it is called at most once per event id.
 */
@Injectable()
export class OnMortalityHandler {
  constructor(
    @Inject(BATCH_EVENT_REPOSITORY) private readonly batches: BatchEventRepositoryPort,
  ) {}

  async handle(event: MortalityRecorded): Promise<void> {
    const batch = await this.batches.findById(event.batchId);
    if (!batch) {
      throw new NotFoundError(`Batch ${event.batchId} not found for MortalityRecorded.`);
    }
    await this.batches.save(batch.applyMortality(event.count));
  }
}
