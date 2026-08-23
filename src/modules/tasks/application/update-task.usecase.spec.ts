import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { MembershipDirectoryPort } from '../../identity/application/ports/membership-directory.port';
import { ProjectMembership } from '../../identity/domain/project-membership.entity';
import { PondRepositoryPort } from '../../ponds/application/ports/pond-repository.port';
import { Pond } from '../../ponds/domain/pond.entity';
import { Task } from '../domain/task.entity';
import { TaskRepositoryPort } from './ports/task-repository.port';
import { UpdateTaskUseCase } from './update-task.usecase';

function existingTask(overrides: Partial<Parameters<typeof Task.reconstitute>[0]> = {}) {
  return Task.reconstitute({
    id: 't-1',
    projectId: 'p-1',
    pondId: null,
    title: 'Chain drag',
    recurrenceDays: 7,
    status: 'DUE',
    dueOn: new Date('2026-02-15T00:00:00Z'),
    assigneeUserId: null,
    ...overrides,
  });
}

function membership(role: 'OWNER' | 'WORKER' | 'PARTNER' = 'WORKER'): ProjectMembership {
  return ProjectMembership.reconstitute({
    id: 'm-1',
    userId: 'u-worker',
    projectId: 'p-1',
    role,
    status: 'ACTIVE',
    createdAt: new Date(),
  });
}

function setup(
  overrides: {
    task?: Task | null;
    pond?: Pond | null;
    assigneeMemberships?: ProjectMembership[];
  } = {},
) {
  const tasks: jest.Mocked<TaskRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest
      .fn()
      .mockResolvedValue(overrides.task === undefined ? existingTask() : overrides.task),
    save: jest.fn().mockImplementation(async (t: Task) => t),
    deleteById: jest.fn(),
  };
  const ponds: jest.Mocked<PondRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(
      overrides.pond === undefined
        ? Pond.reconstitute({
            id: 'pond-1',
            projectId: 'p-1',
            name: 'North',
            area: 1,
            depthM: null,
            notes: null,
            createdAt: new Date(),
          })
        : overrides.pond,
    ),
    save: jest.fn(),
  };
  const memberships: jest.Mocked<MembershipDirectoryPort> = {
    findActiveByUserId: jest.fn().mockResolvedValue(overrides.assigneeMemberships ?? []),
  };
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'OWNER' } });
  const useCase = new UpdateTaskUseCase(tasks, ponds, memberships, tenant);
  return { useCase, tasks };
}

describe('UpdateTaskUseCase', () => {
  it('updates title and assignee', async () => {
    const { useCase, tasks } = setup({ assigneeMemberships: [membership('WORKER')] });
    const updated = await useCase.execute({
      taskId: 't-1',
      title: 'Deep chain drag',
      assigneeUserId: 'u-worker',
    });
    expect(updated.title).toBe('Deep chain drag');
    expect(updated.assigneeUserId).toBe('u-worker');
    expect(tasks.save).toHaveBeenCalledTimes(1);
  });

  it('moves dueOn into the future and becomes SCHEDULED', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-15T12:00:00Z'));
    try {
      const { useCase } = setup();
      const updated = await useCase.execute({ taskId: 't-1', dueOn: '2026-03-01' });
      expect(updated.status).toBe('SCHEDULED');
      expect(updated.dueOn.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects a past dueOn', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-15T12:00:00Z'));
    try {
      const { useCase, tasks } = setup();
      await expect(useCase.execute({ taskId: 't-1', dueOn: '2026-02-01' })).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(tasks.save).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears assignee with null', async () => {
    const { useCase } = setup({ task: existingTask({ assigneeUserId: 'u-worker' }) });
    const updated = await useCase.execute({ taskId: 't-1', assigneeUserId: null });
    expect(updated.assigneeUserId).toBeNull();
  });

  it('unknown task is not found', async () => {
    const { useCase } = setup({ task: null });
    await expect(useCase.execute({ taskId: 'missing', title: 'X' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
