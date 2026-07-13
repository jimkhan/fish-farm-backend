import { Task } from '../domain/task.entity';
import { ListTasksUseCase } from './list-tasks.usecase';
import { TaskRepositoryPort } from './ports/task-repository.port';

describe('ListTasksUseCase (TASK-041, CON-029)', () => {
  it('recomputes status at read time (SCHEDULED -> DUE) without persisting', async () => {
    const stale = Task.reconstitute({
      id: 't-1',
      projectId: 'p-1',
      pondId: null,
      title: 'Liming',
      recurrenceDays: 15,
      status: 'SCHEDULED',
      dueOn: new Date('2026-02-10T00:00:00Z'),
    });
    const tasks: jest.Mocked<TaskRepositoryPort> = {
      findAllInCurrentProject: jest.fn().mockResolvedValue([stale]),
      findById: jest.fn(),
      save: jest.fn(),
    };
    const useCase = new ListTasksUseCase(tasks);

    jest.useFakeTimers().setSystemTime(new Date('2026-02-12T00:00:00Z'));
    try {
      const result = await useCase.execute();
      expect(result[0].status).toBe('MISSED');
    } finally {
      jest.useRealTimers();
    }
    expect(tasks.save).not.toHaveBeenCalled();
  });
});
