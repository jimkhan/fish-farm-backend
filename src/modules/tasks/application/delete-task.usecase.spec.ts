import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { Task } from '../domain/task.entity';
import { DeleteTaskUseCase } from './delete-task.usecase';
import { TaskRepositoryPort } from './ports/task-repository.port';

function existingTask() {
  return Task.reconstitute({
    id: 't-1',
    projectId: 'p-1',
    pondId: null,
    title: 'Chain drag',
    recurrenceDays: 7,
    status: 'DUE',
    dueOn: new Date('2026-02-15T00:00:00Z'),
    assigneeUserId: null,
  });
}

describe('DeleteTaskUseCase', () => {
  it('deletes an existing task', async () => {
    const tasks: jest.Mocked<TaskRepositoryPort> = {
      findAllInCurrentProject: jest.fn(),
      findById: jest.fn().mockResolvedValue(existingTask()),
      save: jest.fn(),
      deleteById: jest.fn().mockResolvedValue(true),
    };
    const useCase = new DeleteTaskUseCase(tasks);
    await useCase.execute('t-1');
    expect(tasks.deleteById).toHaveBeenCalledWith('t-1');
  });

  it('unknown task is not found', async () => {
    const tasks: jest.Mocked<TaskRepositoryPort> = {
      findAllInCurrentProject: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      deleteById: jest.fn(),
    };
    const useCase = new DeleteTaskUseCase(tasks);
    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(NotFoundError);
    expect(tasks.deleteById).not.toHaveBeenCalled();
  });
});
