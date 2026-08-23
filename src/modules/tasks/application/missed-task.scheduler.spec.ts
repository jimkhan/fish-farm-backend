import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { Task } from '../domain/task.entity';
import { MissedTaskScheduler } from './missed-task.scheduler';
import { TaskEventRepositoryPort } from './ports/task-event-repository.port';

function task(overrides: Partial<Parameters<typeof Task.reconstitute>[0]> = {}) {
  return Task.reconstitute({
    id: 't-1',
    projectId: 'p-1',
    pondId: null,
    title: 'Chain drag',
    recurrenceDays: null,
    status: 'DUE',
    dueOn: new Date('2026-02-10T00:00:00Z'),
    assigneeUserId: null,
    ...overrides,
  });
}

function setup(overrides: { candidates?: Task[] } = {}) {
  const tasks: jest.Mocked<TaskEventRepositoryPort> = {
    findDueOrOverdue: jest.fn().mockResolvedValue(overrides.candidates ?? []),
    save: jest.fn().mockImplementation(async (t: Task) => t),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as DomainEventBus;
  const scheduler = new MissedTaskScheduler(tasks, events);
  return { scheduler, tasks, events };
}

describe('MissedTaskScheduler (TASK-041, F5/R10, AC-135)', () => {
  it('transitions an overdue DUE task to MISSED and emits MissedTask', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-15T00:00:00Z'));
    try {
      const { scheduler, tasks, events } = setup({ candidates: [task({ dueOn: new Date('2026-02-10T00:00:00Z') })] });
      await scheduler.scan();
      expect(tasks.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'MISSED' }));
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'MissedTask', projectId: 'p-1', sourceRef: 't-1' }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('promotes SCHEDULED to DUE without emitting MissedTask', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-15T00:00:00Z'));
    try {
      const { scheduler, tasks, events } = setup({
        candidates: [task({ status: 'SCHEDULED', dueOn: new Date('2026-02-15T00:00:00Z') })],
      });
      await scheduler.scan();
      expect(tasks.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'DUE' }));
      expect(events.publish).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does nothing for a task whose recomputed status is unchanged', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-10T00:00:00Z'));
    try {
      const { scheduler, tasks, events } = setup({
        candidates: [task({ status: 'DUE', dueOn: new Date('2026-02-10T00:00:00Z') })],
      });
      await scheduler.scan();
      expect(tasks.save).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not re-emit for a task already MISSED (not in the candidate set from a real repo, but defensively verified via a no-status-change scan)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-20T00:00:00Z'));
    try {
      // A real TaskEventRepositoryPort.findDueOrOverdue only returns SCHEDULED/DUE tasks (never
      // MISSED/DONE), so this scenario cannot occur via the real query — this test guards the
      // scheduler's own defensive "unchanged status -> skip" branch directly.
      const { scheduler, tasks, events } = setup({
        candidates: [task({ status: 'MISSED', dueOn: new Date('2026-02-10T00:00:00Z') })],
      });
      await scheduler.scan();
      expect(tasks.save).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
