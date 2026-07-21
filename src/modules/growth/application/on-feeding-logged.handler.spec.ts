import { FeedingLogged } from '@fish-farm/shared';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { BatchEventRepositoryPort } from '../../ponds/application/ports/batch-event-repository.port';
import { Batch } from '../../ponds/domain/batch.entity';
import { OnFeedingLoggedHandler } from './on-feeding-logged.handler';
import { PondFeedAccumulatorEventRepositoryPort } from './ports/pond-feed-accumulator-event-repository.port';

const batch = Batch.reconstitute({
  id: 'batch-1',
  projectId: 'p-1',
  pondId: 'pond-1',
  stockingId: 'stocking-1',
  speciesId: 'sp-1',
  initialCount: 1000,
  cumulativeMortality: 0,
  harvestedCount: 0,
  latestAvgWeightG: null,
  status: 'ACTIVE',
  stockedOn: new Date(),
  createdAt: new Date(),
});

function setup(overrides: { batch?: Batch | null } = {}) {
  const batches: jest.Mocked<BatchEventRepositoryPort> = {
    findById: jest.fn().mockResolvedValue(overrides.batch === undefined ? batch : overrides.batch),
    findAllActive: jest.fn(),
    save: jest.fn(),
  };
  const accumulator: jest.Mocked<PondFeedAccumulatorEventRepositoryPort> = {
    incrementFeedKg: jest.fn().mockResolvedValue(undefined),
  };
  const handler = new OnFeedingLoggedHandler(batches, accumulator);
  return { handler, batches, accumulator };
}

function event(overrides: Partial<FeedingLogged> = {}): FeedingLogged {
  return {
    name: 'FeedingLogged',
    eventId: 'e-1',
    occurredAt: new Date(),
    projectId: 'p-1',
    batchId: 'batch-1',
    qtyKg: 5,
    fedAt: new Date(),
    ...overrides,
  };
}

describe('OnFeedingLoggedHandler (TASK-030, MOD-07 §4.4, R3)', () => {
  it('resolves batchId → pondId and accumulates the pond feed total', async () => {
    const { handler, accumulator } = setup();
    await handler.handle(event({ qtyKg: 5 }));
    expect(accumulator.incrementFeedKg).toHaveBeenCalledWith('p-1', 'pond-1', 5);
  });

  it('throws NotFoundError when the batch cannot be resolved, never silently drops the event', async () => {
    const { handler, accumulator } = setup({ batch: null });
    await expect(handler.handle(event())).rejects.toBeInstanceOf(NotFoundError);
    expect(accumulator.incrementFeedKg).not.toHaveBeenCalled();
  });
});
