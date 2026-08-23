import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { MembershipDirectoryPort } from '../../identity/application/ports/membership-directory.port';
import { ProjectMembership } from '../../identity/domain/project-membership.entity';
import { PondRepositoryPort } from '../../ponds/application/ports/pond-repository.port';
import { Pond } from '../../ponds/domain/pond.entity';
import { ProjectRepositoryPort } from '../../projects/application/ports/project-repository.port';
import { Project } from '../../projects/domain/project.entity';
import { Task } from '../domain/task.entity';
import { CreateTaskUseCase } from './create-task.usecase';
import { TaskRepositoryPort } from './ports/task-repository.port';

const project = Project.reconstitute({
  id: 'p-1',
  name: 'Farm',
  siteLat: 23.8,
  siteLng: 90.4,
  address: null,
  currency: 'BDT',
  landUnit: 'BIGHA',
  status: 'ACTIVE',
  createdAt: new Date(),
});

const pond = Pond.reconstitute({
  id: 'pond-1',
  projectId: 'p-1',
  name: 'North Pond',
  area: 10,
  depthM: null,
  notes: null,
  createdAt: new Date(),
});

function membership(overrides: {
  userId?: string;
  projectId?: string;
  role?: 'OWNER' | 'WORKER' | 'PARTNER';
} = {}): ProjectMembership {
  return ProjectMembership.reconstitute({
    id: 'm-1',
    userId: overrides.userId ?? 'u-worker',
    projectId: overrides.projectId ?? 'p-1',
    role: overrides.role ?? 'WORKER',
    status: 'ACTIVE',
    createdAt: new Date(),
  });
}

function setup(
  overrides: {
    project?: Project | null;
    pond?: Pond | null;
    assigneeMemberships?: ProjectMembership[];
  } = {},
) {
  const tasks: jest.Mocked<TaskRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn(),
    save: jest.fn().mockImplementation(async (t: Task) => t),
    deleteById: jest.fn(),
  };
  const ponds: jest.Mocked<PondRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.pond === undefined ? pond : overrides.pond),
    save: jest.fn(),
  };
  const projects: jest.Mocked<ProjectRepositoryPort> = {
    findAllActive: jest.fn(),
    findById: jest
      .fn()
      .mockResolvedValue(overrides.project === undefined ? project : overrides.project),
    findPage: jest.fn(),
    save: jest.fn(),
  };
  const memberships: jest.Mocked<MembershipDirectoryPort> = {
    findActiveByUserId: jest.fn().mockResolvedValue(overrides.assigneeMemberships ?? []),
  };
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'OWNER' } });

  const useCase = new CreateTaskUseCase(tasks, ponds, projects, memberships, tenant);
  return { useCase, tasks, ponds, projects, memberships };
}

describe('CreateTaskUseCase (TASK-041, CON-030, AC-134)', () => {
  it('creates a task scoped to the project, due today', async () => {
    const { useCase, tasks } = setup();
    const task = await useCase.execute({ title: 'Chain drag', recurrenceDays: 10 });
    expect(task.projectId).toBe('p-1');
    expect(task.status).toBe('DUE');
    expect(task.assigneeUserId).toBeNull();
    expect(tasks.save).toHaveBeenCalledTimes(1);
  });

  it('accepts a future dueOn and lands as SCHEDULED', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-15T12:00:00Z'));
    try {
      const { useCase } = setup();
      const task = await useCase.execute({ title: 'Liming', dueOn: '2026-03-01' });
      expect(task.status).toBe('SCHEDULED');
      expect(task.dueOn.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects a past dueOn', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-15T12:00:00Z'));
    try {
      const { useCase, tasks } = setup();
      await expect(useCase.execute({ title: 'Late', dueOn: '2026-02-10' })).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(tasks.save).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('assigns an ACTIVE WORKER on the project', async () => {
    const { useCase } = setup({ assigneeMemberships: [membership({ role: 'WORKER' })] });
    const task = await useCase.execute({ title: 'Chain drag', assigneeUserId: 'u-worker' });
    expect(task.assigneeUserId).toBe('u-worker');
  });

  it('assigns an ACTIVE OWNER on the project', async () => {
    const { useCase } = setup({
      assigneeMemberships: [membership({ userId: 'u-owner', role: 'OWNER' })],
    });
    const task = await useCase.execute({ title: 'Chain drag', assigneeUserId: 'u-owner' });
    expect(task.assigneeUserId).toBe('u-owner');
  });

  it('rejects a Partner assignee', async () => {
    const { useCase, tasks } = setup({
      assigneeMemberships: [membership({ userId: 'u-partner', role: 'PARTNER' })],
    });
    await expect(
      useCase.execute({ title: 'Chain drag', assigneeUserId: 'u-partner' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(tasks.save).not.toHaveBeenCalled();
  });

  it('rejects an assignee who is not a member of this project', async () => {
    const { useCase, tasks } = setup({ assigneeMemberships: [] });
    await expect(
      useCase.execute({ title: 'Chain drag', assigneeUserId: 'u-elsewhere' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(tasks.save).not.toHaveBeenCalled();
  });

  it('a non-positive recurrenceDays is rejected', async () => {
    const { useCase, tasks } = setup();
    await expect(useCase.execute({ title: 'Bad', recurrenceDays: 0 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(tasks.save).not.toHaveBeenCalled();
  });

  it('a pond from another project (or unknown) is not found', async () => {
    const { useCase, tasks } = setup({ pond: null });
    await expect(
      useCase.execute({ title: 'Aeration', pondId: 'pond-elsewhere' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(tasks.save).not.toHaveBeenCalled();
  });

  it('the project must exist', async () => {
    const { useCase } = setup({ project: null });
    await expect(useCase.execute({ title: 'X' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
