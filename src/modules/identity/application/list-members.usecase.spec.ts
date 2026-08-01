import { ProjectMembership } from '../domain/project-membership.entity';
import { User } from '../domain/user.entity';
import { ListMembersUseCase } from './list-members.usecase';
import { ProjectMembershipRepositoryPort } from './ports/project-membership-repository.port';
import { UserRepositoryPort } from './ports/user-repository.port';

describe('ListMembersUseCase (TASK-010/047, CON-010)', () => {
  const membership = ProjectMembership.reconstitute({
    id: 'm-1',
    userId: 'u-1',
    projectId: 'p-1',
    role: 'OWNER',
    status: 'ACTIVE',
    createdAt: new Date(),
  });

  function makeMemberships(): jest.Mocked<ProjectMembershipRepositoryPort> {
    return {
      findActiveByProjectId: jest.fn().mockResolvedValue([membership]),
      countActiveOwners: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
    };
  }

  it("returns the project's active members joined with each member's email/name (TASK-047)", async () => {
    const memberships = makeMemberships();
    const users: jest.Mocked<UserRepositoryPort> = {
      findByEmail: jest.fn(),
      findById: jest.fn().mockResolvedValue(
        User.reconstitute({
          id: 'u-1',
          email: 'rahima@example.com',
          name: 'Rahima Khatun',
          passwordHash: 'x',
          status: 'ACTIVE',
          createdAt: new Date(),
        }),
      ),
      updatePasswordHash: jest.fn(),
      create: jest.fn(),
    };

    const result = await new ListMembersUseCase(memberships, users).execute();

    expect(result).toEqual([
      { id: 'm-1', userId: 'u-1', projectId: 'p-1', role: 'OWNER', email: 'rahima@example.com', name: 'Rahima Khatun' },
    ]);
    expect(memberships.findActiveByProjectId).toHaveBeenCalledTimes(1);
    expect(users.findById).toHaveBeenCalledWith('u-1');
  });

  it("falls back to the email as the name when the member's user can't be resolved", async () => {
    const users: jest.Mocked<UserRepositoryPort> = {
      findByEmail: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
      updatePasswordHash: jest.fn(),
      create: jest.fn(),
    };

    const result = await new ListMembersUseCase(makeMemberships(), users).execute();

    expect(result[0]).toMatchObject({ id: 'm-1', role: 'OWNER', email: '', name: '' });
  });
});
