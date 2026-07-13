import { Pond } from '../domain/pond.entity';
import { ListPondsUseCase } from './list-ponds.usecase';
import { PondRepositoryPort } from './ports/pond-repository.port';

describe('ListPondsUseCase (TASK-018, CON-013)', () => {
  it("returns the current project's ponds", async () => {
    const pond = Pond.reconstitute({
      id: 'pond-1',
      projectId: 'p-1',
      name: 'North Pond',
      area: 12.5,
      depthM: null,
      notes: null,
      createdAt: new Date(),
    });
    const ponds: jest.Mocked<PondRepositoryPort> = {
      findAllInCurrentProject: jest.fn().mockResolvedValue([pond]),
      findById: jest.fn(),
      save: jest.fn(),
    };

    const useCase = new ListPondsUseCase(ponds);
    const result = await useCase.execute();

    expect(result).toEqual([pond]);
    expect(ponds.findAllInCurrentProject).toHaveBeenCalledTimes(1);
  });
});
