import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
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

function setup(overrides: { project?: Project | null; pond?: Pond | null } = {}) {
  const tasks: jest.Mocked<TaskRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn(),
    save: jest.fn().mockImplementation(async (t: Task) => t),
  };
  const ponds: jest.Mocked<PondRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.pond === undefined ? pond : overrides.pond),
    save: jest.fn(),
  };
  const projects: jest.Mocked<ProjectRepositoryPort> = {
    findById: jest
      .fn()
      .mockResolvedValue(overrides.project === undefined ? project : overrides.project),
    findPage: jest.fn(),
    save: jest.fn(),
  };
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'OWNER' } });

  const useCase = new CreateTaskUseCase(tasks, ponds, projects, tenant);
  return { useCase, tasks, ponds, projects };
}

describe('CreateTaskUseCase (TASK-041, CON-030, AC-134)', () => {
  it('creates a task scoped to the project, due today', async () => {
    const { useCase, tasks } = setup();
    const task = await useCase.execute({ title: 'Chain drag', recurrenceDays: 10 });
    expect(task.projectId).toBe('p-1');
    expect(task.status).toBe('DUE');
    expect(tasks.save).toHaveBeenCalledTimes(1);
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
