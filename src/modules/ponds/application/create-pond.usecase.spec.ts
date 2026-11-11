import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { Project } from '../../projects/domain/project.entity';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { ProjectRepositoryPort } from '../../projects/application/ports/project-repository.port';
import { Pond } from '../domain/pond.entity';
import { CreatePondUseCase } from './create-pond.usecase';
import { PondRepositoryPort } from './ports/pond-repository.port';

function projectFixture(overrides: Partial<Parameters<typeof Project.reconstitute>[0]> = {}) {
  return Project.reconstitute({
    id: 'p-1',
    name: 'North Pond Farm',
    siteLat: 23.81,
    siteLng: 90.41,
    address: null,
    currency: 'BDT',
    landUnit: 'BIGHA',
    status: 'ACTIVE',
    createdAt: new Date(),
    ...overrides,
  });
}

function setup(overrides: { project?: Project | null } = {}) {
  const ponds: jest.Mocked<PondRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn(),
    save: jest.fn().mockImplementation(async (p: Pond) => p),
  };
  const projects: jest.Mocked<ProjectRepositoryPort> = {
    findByIds: jest.fn().mockResolvedValue([]),
    findAllActive: jest.fn(),
    findById: jest
      .fn()
      .mockResolvedValue(overrides.project === undefined ? projectFixture() : overrides.project),
    findPage: jest.fn(),
    save: jest.fn(),
  };
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'OWNER' } });

  const useCase = new CreatePondUseCase(ponds, projects, tenant);
  return { useCase, ponds, projects };
}

describe('CreatePondUseCase (TASK-018, CON-014, AC-060/069)', () => {
  it('AC-060: persists the pond scoped to the current project', async () => {
    const { useCase, ponds } = setup();
    const pond = await useCase.execute({ name: 'North Pond', area: 12.5 });

    expect(pond.projectId).toBe('p-1');
    expect(pond.name).toBe('North Pond');
    expect(ponds.save).toHaveBeenCalledTimes(1);
  });

  it('AC-069: creating a pond on a CLOSED project returns PROJECT_CLOSED', async () => {
    const { useCase, ponds } = setup({ project: projectFixture({ status: 'CLOSED' }) });
    await expect(useCase.execute({ name: 'North Pond', area: 12.5 })).rejects.toBeInstanceOf(
      ProjectClosedError,
    );
    expect(ponds.save).not.toHaveBeenCalled();
  });

  it('an unknown project throws NotFoundError', async () => {
    const { useCase } = setup({ project: null });
    await expect(useCase.execute({ name: 'North Pond', area: 12.5 })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('defaults depthM/notes to null when omitted', async () => {
    const { useCase } = setup();
    const pond = await useCase.execute({ name: 'North Pond', area: 12.5 });
    expect(pond.depthM).toBeNull();
    expect(pond.notes).toBeNull();
  });
});
