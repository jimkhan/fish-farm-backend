import { ProjectMembership } from '../domain/project-membership.entity';
import { ListMembersUseCase } from './list-members.usecase';
import { ProjectMembershipRepositoryPort } from './ports/project-membership-repository.port';

describe('ListMembersUseCase (TASK-010, CON-010)', () => {
  it("returns the current project's active memberships", async () => {
    const membership = ProjectMembership.reconstitute({
      id: 'm-1',
      userId: 'u-1',
      projectId: 'p-1',
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: new Date(),
    });
    const memberships: jest.Mocked<ProjectMembershipRepositoryPort> = {
      findActiveByProjectId: jest.fn().mockResolvedValue([membership]),
      countActiveOwners: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
    };

    const useCase = new ListMembersUseCase(memberships);
    const result = await useCase.execute();

    expect(result).toEqual([membership]);
    expect(memberships.findActiveByProjectId).toHaveBeenCalledTimes(1);
  });
});
