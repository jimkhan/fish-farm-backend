import { SamplingRecorded } from '@fish-farm/shared';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { Batch } from '../domain/batch.entity';
import { OnSamplingHandler } from './on-sampling.handler';
import { BatchEventRepositoryPort } from './ports/batch-event-repository.port';

const batch = Batch.reconstitute({
  id: 'b-1',
  projectId: 'p-1',
  pondId: 'pond-1',
  stockingId: 's-1',
  speciesId: 'species-1',
  initialCount: 1000,
  cumulativeMortality: 0,
  harvestedCount: 0,
  latestAvgWeightG: null,
  status: 'ACTIVE',
  stockedOn: new Date(),
  createdAt: new Date(),
});

const event: SamplingRecorded = {
  name: 'SamplingRecorded',
  eventId: 'evt-1',
  occurredAt: new Date(),
  batchId: 'b-1',
  avgWeightG: 22.5,
};

function setup(overrides: { batch?: Batch | null } = {}) {
  const batches: jest.Mocked<BatchEventRepositoryPort> = {
    findById: jest.fn().mockResolvedValue(overrides.batch === undefined ? batch : overrides.batch),
    findWithStockInPond: jest.fn(),
    save: jest.fn().mockImplementation(async (b: Batch) => b),
  };
  return { handler: new OnSamplingHandler(batches), batches };
}

describe('OnSamplingHandler (TASK-019, MOD-04 F3, AC-066)', () => {
  it('AC-066: updates the latest average weight on the referenced batch', async () => {
    const { handler, batches } = setup();
    await handler.handle(event);

    const saved = batches.save.mock.calls[0][0] as Batch;
    expect(saved.latestAvgWeightG).toBe(22.5);
    expect(saved.biomassGrams).toBe(1000 * 22.5);
  });

  it('an event referencing an unknown batch throws', async () => {
    const { handler } = setup({ batch: null });
    await expect(handler.handle(event)).rejects.toBeInstanceOf(NotFoundError);
  });
});
