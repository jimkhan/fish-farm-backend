import { ProjectMembership } from '../../identity/domain/project-membership.entity';
import { MembershipDirectoryPort } from '../../identity/application/ports/membership-directory.port';
import { ListProjectsUseCase } from './list-projects.usecase';
import { ProjectListPage, ProjectRepositoryPort } from './ports/project-repository.port';

function membershipIn(projectId: string) {
  return ProjectMembership.reconstitute({
    id: `m-${projectId}`,
    userId: 'u-1',
    projectId,
    role: 'OWNER',
    status: 'ACTIVE',
    createdAt: new Date(),
  });
}

function setup(overrides: { memberships?: ProjectMembership[]; page?: ProjectListPage } = {}) {
  const directory: jest.Mocked<MembershipDirectoryPort> = {
    findActiveByUserId: jest
      .fn()
      .mockResolvedValue(overrides.memberships ?? [membershipIn('p-1'), membershipIn('p-2')]),
  };
  const projects: jest.Mocked<ProjectRepositoryPort> = {
    findAllActive: jest.fn(),
    findById: jest.fn(),
    findPage: jest.fn().mockResolvedValue(overrides.page ?? { data: [], nextCursor: null }),
    save: jest.fn(),
  };

  const useCase = new ListProjectsUseCase(projects, directory);
  return { useCase, projects, directory };
}

describe('ListProjectsUseCase (TASK-011, CON-006)', () => {
  it("queries the repository with exactly the caller's membership project ids", async () => {
    const { useCase, projects } = setup();
    await useCase.execute('u-1', null, 50);
    expect(projects.findPage).toHaveBeenCalledWith(['p-1', 'p-2'], null, 50);
  });

  it('a caller with zero memberships short-circuits to an empty page without querying', async () => {
    const { useCase, projects } = setup({ memberships: [] });
    const page = await useCase.execute('u-1', null, 50);
    expect(page).toEqual({ data: [], nextCursor: null });
    expect(projects.findPage).not.toHaveBeenCalled();
  });

  it('forwards cursor/limit through to the repository', async () => {
    const { useCase, projects } = setup();
    await useCase.execute('u-1', 'some-cursor', 10);
    expect(projects.findPage).toHaveBeenCalledWith(['p-1', 'p-2'], 'some-cursor', 10);
  });
});
