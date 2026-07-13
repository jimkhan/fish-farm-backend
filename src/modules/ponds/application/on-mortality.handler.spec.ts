import { MortalityRecorded } from '@fish-farm/shared';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { Batch } from '../domain/batch.entity';
import { OnMortalityHandler } from './on-mortality.handler';
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

const event: MortalityRecorded = {
  name: 'MortalityRecorded',
  eventId: 'evt-1',
  occurredAt: new Date(),
  batchId: 'b-1',
  count: 50,
};

function setup(overrides: { batch?: Batch | null } = {}) {
  const batches: jest.Mocked<BatchEventRepositoryPort> = {
    findById: jest.fn().mockResolvedValue(overrides.batch === undefined ? batch : overrides.batch),
    findAllActive: jest.fn(),
    save: jest.fn().mockImplementation(async (b: Batch) => b),
  };
  return { handler: new OnMortalityHandler(batches), batches };
}

describe('OnMortalityHandler (TASK-019, MOD-04 F3, AC-063)', () => {
  it('AC-063: increments cumulative mortality on the referenced batch', async () => {
    const { handler, batches } = setup();
    await handler.handle(event);

    expect(batches.save).toHaveBeenCalledTimes(1);
    const saved = batches.save.mock.calls[0][0] as Batch;
    expect(saved.cumulativeMortality).toBe(50);
    expect(saved.survivalEstimate).toBe(950);
  });

  it('an event referencing an unknown batch throws (bus retries then logs and drops)', async () => {
    const { handler } = setup({ batch: null });
    await expect(handler.handle(event)).rejects.toBeInstanceOf(NotFoundError);
  });
});
