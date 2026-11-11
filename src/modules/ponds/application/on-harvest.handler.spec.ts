import { HarvestRecorded } from '@fish-farm/shared';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { Batch } from '../domain/batch.entity';
import { OnHarvestHandler } from './on-harvest.handler';
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
  latestAvgWeightG: 20,
  status: 'ACTIVE',
  stockedOn: new Date(),
  createdAt: new Date(),
});

const event: HarvestRecorded = {
  name: 'HarvestRecorded',
  eventId: 'evt-1',
  occurredAt: new Date(),
  batchId: 'b-1',
  count: 300,
};

function setup(overrides: { batch?: Batch | null } = {}) {
  const batches: jest.Mocked<BatchEventRepositoryPort> = {
    findById: jest.fn().mockResolvedValue(overrides.batch === undefined ? batch : overrides.batch),
    findWithStockInPond: jest.fn(),
    save: jest.fn().mockImplementation(async (b: Batch) => b),
  };
  return { handler: new OnHarvestHandler(batches), batches };
}

describe('OnHarvestHandler (TASK-019, MOD-04 F3, AC-067)', () => {
  it('AC-067: reduces the remaining count and biomass', async () => {
    const { handler, batches } = setup();
    await handler.handle(event);

    const saved = batches.save.mock.calls[0][0] as Batch;
    expect(saved.harvestedCount).toBe(300);
    expect(saved.survivalEstimate).toBe(700);
    expect(saved.biomassGrams).toBe(700 * 20);
  });

  it('an event referencing an unknown batch throws', async () => {
    const { handler } = setup({ batch: null });
    await expect(handler.handle(event)).rejects.toBeInstanceOf(NotFoundError);
  });
});
