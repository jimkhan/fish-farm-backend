import { Logger } from '@nestjs/common';
import { DomainEvent } from '@fish-farm/shared';
import { DomainEventBus } from './domain-event-bus';

function event(name = 'WidgetPlanted', eventId = 'evt-1'): DomainEvent {
  return { name, eventId, occurredAt: new Date('2026-07-08T00:00:00Z'), projectId: 'p-1' };
}

describe('DomainEventBus (TASK-006, FT-007, ADR-015)', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delivers a published event to every subscriber of its name', async () => {
    const bus = new DomainEventBus();
    const first = jest.fn();
    const second = jest.fn();
    const other = jest.fn();
    bus.subscribe('WidgetPlanted', first);
    bus.subscribe('WidgetPlanted', second);
    bus.subscribe('SomethingElseHappened', other);

    const e = event();
    await bus.publish(e);

    expect(first).toHaveBeenCalledWith(e);
    expect(second).toHaveBeenCalledWith(e);
    expect(other).not.toHaveBeenCalled();
  });

  it('resolves quietly when nothing subscribes to the event', async () => {
    await expect(new DomainEventBus().publish(event())).resolves.toBeUndefined();
  });

  it('unsubscribe stops delivery', async () => {
    const bus = new DomainEventBus();
    const handler = jest.fn();
    const unsubscribe = bus.subscribe('WidgetPlanted', handler);

    await bus.publish(event());
    unsubscribe();
    await bus.publish(event('WidgetPlanted', 'evt-2'));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('AC-013: a persistently failing subscriber is retried, logged, and never crashes the publisher — others still delivered', async () => {
    const bus = new DomainEventBus();
    const failing = jest.fn().mockRejectedValue(new Error('subscriber down'));
    const healthy = jest.fn();
    bus.subscribe('WidgetPlanted', failing);
    bus.subscribe('WidgetPlanted', healthy);

    await expect(bus.publish(event())).resolves.toBeUndefined();

    expect(failing).toHaveBeenCalledTimes(3); // MAX_ATTEMPTS
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('eventId=evt-1'),
      expect.any(String),
    );
  });

  it('a transiently failing subscriber succeeds on retry without an error-level log', async () => {
    const bus = new DomainEventBus();
    const flaky = jest
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(undefined);
    bus.subscribe('WidgetPlanted', flaky);

    await bus.publish(event());

    expect(flaky).toHaveBeenCalledTimes(2);
    expect(Logger.prototype.error).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
  });

  it('also isolates synchronous throws (non-async handlers)', async () => {
    const bus = new DomainEventBus();
    bus.subscribe('WidgetPlanted', () => {
      throw new Error('sync boom');
    });

    await expect(bus.publish(event())).resolves.toBeUndefined();
  });

  describe('savepoint isolation inside the publisher transaction', () => {
    /** A TransactionContext exposing a fake QueryRunner that records the SQL it is asked to run. */
    function transactionalContext() {
      const sql: string[] = [];
      const queryRunner = {
        isTransactionActive: true,
        query: jest.fn(async (statement: string) => {
          sql.push(statement);
        }),
      };
      const transactions = { manager: { queryRunner } } as never;
      return { transactions, sql };
    }

    it('rolls a failed attempt back to its savepoint before retrying, so a partial write is not re-applied', async () => {
      const { transactions, sql } = transactionalContext();
      const bus = new DomainEventBus(transactions);
      const flaky = jest
        .fn()
        .mockRejectedValueOnce(new Error('failed after writing a row'))
        .mockResolvedValueOnce(undefined);
      bus.subscribe('WidgetPlanted', flaky);

      await bus.publish(event());

      expect(flaky).toHaveBeenCalledTimes(2);
      expect(sql).toEqual([
        'SAVEPOINT ffms_evt_1',
        'ROLLBACK TO SAVEPOINT ffms_evt_1', // attempt 1's partial write undone...
        'SAVEPOINT ffms_evt_2',
        'RELEASE SAVEPOINT ffms_evt_2', // ...before attempt 2 runs and succeeds
      ]);
    });

    it('leaves nothing behind when a handler is dropped after MAX_ATTEMPTS', async () => {
      const { transactions, sql } = transactionalContext();
      const bus = new DomainEventBus(transactions);
      bus.subscribe('WidgetPlanted', jest.fn().mockRejectedValue(new Error('down')));

      await expect(bus.publish(event())).resolves.toBeUndefined();

      expect(sql.filter((s) => s.startsWith('ROLLBACK TO'))).toHaveLength(3);
      expect(sql.filter((s) => s.startsWith('RELEASE'))).toHaveLength(0);
    });

    it('logs the full event payload when a reaction is permanently dropped', async () => {
      const { transactions } = transactionalContext();
      const bus = new DomainEventBus(transactions);
      bus.subscribe('WidgetPlanted', jest.fn().mockRejectedValue(new Error('down')));

      await bus.publish(event());

      // The publisher still commits, so this log is the only remaining record of the reaction.
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining('"projectId":"p-1"'),
        expect.any(String),
      );
    });

    it('takes no savepoint when no transaction is active', async () => {
      const sql: string[] = [];
      const transactions = {
        manager: {
          queryRunner: {
            isTransactionActive: false,
            query: jest.fn(async (s: string) => {
              sql.push(s);
            }),
          },
        },
      } as never;
      const bus = new DomainEventBus(transactions);
      const handler = jest.fn();
      bus.subscribe('WidgetPlanted', handler);

      await bus.publish(event());

      expect(handler).toHaveBeenCalledTimes(1);
      expect(sql).toEqual([]);
    });
  });
});
