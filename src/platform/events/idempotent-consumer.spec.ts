import { DomainEvent } from '@fish-farm/shared';
import { idempotentConsumer } from './idempotent-consumer';

function event(eventId: string): DomainEvent {
  return { name: 'WidgetPlanted', eventId, occurredAt: new Date('2026-07-08T00:00:00Z') };
}

describe('idempotentConsumer (TASK-006, ADR-015)', () => {
  it('processes each eventId at most once', async () => {
    const handler = jest.fn();
    const consume = idempotentConsumer(handler);

    await consume(event('evt-1'));
    await consume(event('evt-1'));
    await consume(event('evt-2'));

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('does not mark a failed handling as seen — a retry still runs the handler', async () => {
    const handler = jest
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue(undefined);
    const consume = idempotentConsumer(handler);

    await expect(consume(event('evt-1'))).rejects.toThrow('transient');
    await consume(event('evt-1')); // retry succeeds
    await consume(event('evt-1')); // now deduplicated

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('evicts oldest ids beyond capacity (bounded memory)', async () => {
    const handler = jest.fn();
    const consume = idempotentConsumer(handler, { capacity: 2 });

    await consume(event('evt-1'));
    await consume(event('evt-2'));
    await consume(event('evt-3')); // evicts evt-1
    await consume(event('evt-1')); // processed again after eviction

    expect(handler).toHaveBeenCalledTimes(4);
  });
});
