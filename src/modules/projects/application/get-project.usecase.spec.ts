import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { Project } from '../domain/project.entity';
import { GetProjectUseCase } from './get-project.usecase';
import { ProjectRepositoryPort } from './ports/project-repository.port';

const fixture = Project.reconstitute({
  id: 'p-1',
  name: 'North Pond Farm',
  siteLat: 23.81,
  siteLng: 90.41,
  address: 'Dhaka',
  currency: 'BDT',
  landUnit: 'BIGHA',
  status: 'ACTIVE',
  createdAt: new Date(),
});

function setup(overrides: { project?: Project | null } = {}) {
  const projects: jest.Mocked<ProjectRepositoryPort> = {
    findById: jest
      .fn()
      .mockResolvedValue(overrides.project === undefined ? fixture : overrides.project),
    findPage: jest.fn(),
    save: jest.fn(),
  };
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'WORKER' } });
  const useCase = new GetProjectUseCase(projects, tenant);
  return { useCase, projects };
}

describe('GetProjectUseCase (TASK-011, CON-008, AC-033)', () => {
  it('AC-033: returns the tenant-scoped project (any member role can read)', async () => {
    const { useCase, projects } = setup();
    const project = await useCase.execute();
    expect(project.id).toBe('p-1');
    expect(projects.findById).toHaveBeenCalledWith('p-1');
  });

  it('an unknown project throws NotFoundError', async () => {
    const { useCase } = setup({ project: null });
    await expect(useCase.execute()).rejects.toBeInstanceOf(NotFoundError);
  });
});
