import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { Task } from '../domain/task.entity';
import { TaskLog } from '../domain/task-log.entity';
import { CompleteTaskUseCase } from './complete-task.usecase';
import { TaskLogRepositoryPort } from './ports/task-log-repository.port';
import { TaskRepositoryPort } from './ports/task-repository.port';

function task(overrides: Partial<Parameters<typeof Task.reconstitute>[0]> = {}) {
  return Task.reconstitute({
    id: 't-1',
    projectId: 'p-1',
    pondId: null,
    title: 'Chain drag',
    recurrenceDays: 10,
    status: 'DUE',
    dueOn: new Date('2026-02-15T00:00:00Z'),
    assigneeUserId: null,
    ...overrides,
  });
}

function setup(overrides: { task?: Task | null; existingLog?: TaskLog | null } = {}) {
  const taskLogs: jest.Mocked<TaskLogRepositoryPort> = {
    findForProjectBetween: jest.fn().mockResolvedValue([]),
    findByClientMutationId: jest
      .fn()
      .mockResolvedValue(overrides.existingLog === undefined ? null : overrides.existingLog),
    save: jest.fn().mockImplementation(async (l: TaskLog) => l),
  };
  const tasks: jest.Mocked<TaskRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.task === undefined ? task() : overrides.task),
    save: jest.fn().mockImplementation(async (t: Task) => t),
    deleteById: jest.fn(),
  };
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'WORKER' } });

  const useCase = new CompleteTaskUseCase(taskLogs, tasks, tenant);
  return { useCase, taskLogs, tasks };
}

describe('CompleteTaskUseCase (TASK-041, CON-031, AC-134, R2)', () => {
  it('records a TaskLog and rolls a recurring task forward', async () => {
    const { useCase, taskLogs, tasks } = setup();
    const log = await useCase.execute('t-1', {
      completedAt: new Date('2026-02-15T14:00:00Z'),
      clientMutationId: 'cmid-1',
    });
    expect(log.taskId).toBe('t-1');
    expect(taskLogs.save).toHaveBeenCalledTimes(1);
    expect(tasks.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'SCHEDULED' }));
  });

  it('a one-off task becomes DONE', async () => {
    const { useCase, tasks } = setup({ task: task({ recurrenceDays: null }) });
    await useCase.execute('t-1', {
      completedAt: new Date('2026-02-15T14:00:00Z'),
      clientMutationId: 'cmid-1',
    });
    expect(tasks.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'DONE' }));
  });

  it('an unknown task is not found', async () => {
    const { useCase, taskLogs } = setup({ task: null });
    await expect(
      useCase.execute('t-elsewhere', {
        completedAt: new Date('2026-02-15T14:00:00Z'),
        clientMutationId: 'cmid-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(taskLogs.save).not.toHaveBeenCalled();
  });

  it('ADR-010: a replayed clientMutationId is idempotent — no duplicate log, no task mutation', async () => {
    const existing = TaskLog.reconstitute({
      id: 'log-existing',
      projectId: 'p-1',
      taskId: 't-1',
      completedAt: new Date('2026-02-15T14:00:00Z'),
      photoUrl: null,
      clientMutationId: 'cmid-1',
    });
    const { useCase, taskLogs, tasks } = setup({ existingLog: existing });
    const result = await useCase.execute('t-1', {
      completedAt: new Date('2026-02-15T14:00:00Z'),
      clientMutationId: 'cmid-1',
    });
    expect(result).toBe(existing);
    expect(taskLogs.save).not.toHaveBeenCalled();
    expect(tasks.save).not.toHaveBeenCalled();
  });
});
