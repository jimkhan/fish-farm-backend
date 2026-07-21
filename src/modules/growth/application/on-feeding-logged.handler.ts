import { Inject, Injectable } from '@nestjs/common';
import { FeedingLogged } from '@fish-farm/shared';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import {
  BATCH_EVENT_REPOSITORY,
  BatchEventRepositoryPort,
} from '../../ponds/application/ports/batch-event-repository.port';
import {
  POND_FEED_ACCUMULATOR_EVENT_REPOSITORY,
  PondFeedAccumulatorEventRepositoryPort,
} from './ports/pond-feed-accumulator-event-repository.port';

/**
 * Reacts to `FeedingLogged` (MOD-05) to accumulate the pond-level feed total for FCR (TASK-030,
 * MOD-07 §4.4, R3). `FeedingLogged` carries no `pondId` — resolved here via `batchId →
 * Batch.pondId` (`BatchEventRepositoryPort`, the same unscoped lookup `OnSamplingHandler` uses).
 * Wrapped in `idempotentConsumer()` at the subscription site (`GrowthModule`) — unlike the
 * finance module's durable dedup-by-`sourceRef` INSERTs, an accumulator increment has no natural
 * idempotency of its own (a redelivered event would double-count), so it needs the same
 * in-process guard as the mortality/sampling/harvest handlers.
 */
@Injectable()
export class OnFeedingLoggedHandler {
  constructor(
    @Inject(BATCH_EVENT_REPOSITORY) private readonly batches: BatchEventRepositoryPort,
    @Inject(POND_FEED_ACCUMULATOR_EVENT_REPOSITORY)
    private readonly accumulator: PondFeedAccumulatorEventRepositoryPort,
  ) {}

  async handle(event: FeedingLogged): Promise<void> {
    const batch = await this.batches.findById(event.batchId);
    if (!batch) {
      throw new NotFoundError(`Batch ${event.batchId} not found for FeedingLogged.`);
    }
    await this.accumulator.incrementFeedKg(event.projectId, batch.pondId, event.qtyKg);
  }
}
