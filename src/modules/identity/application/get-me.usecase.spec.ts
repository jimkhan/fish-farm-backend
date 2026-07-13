import { ProjectMembership } from '../domain/project-membership.entity';
import { User } from '../domain/user.entity';
import { UnauthenticatedError } from '../../../shared-kernel/errors/domain-error';
import { GetMeUseCase } from './get-me.usecase';
import { MembershipDirectoryPort } from './ports/membership-directory.port';
import { UserRepositoryPort } from './ports/user-repository.port';

const activeUser = User.reconstitute({
  id: 'u-1',
  email: 'owner@example.com',
  name: 'Owner',
  passwordHash: 'hash',
  status: 'ACTIVE',
  createdAt: new Date(),
});

const membership = ProjectMembership.reconstitute({
  id: 'm-1',
  userId: 'u-1',
  projectId: 'p-1',
  role: 'OWNER',
  status: 'ACTIVE',
  createdAt: new Date(),
});

function setup(overrides: { user?: User | null; memberships?: ProjectMembership[] } = {}) {
  const users: jest.Mocked<UserRepositoryPort> = {
    findByEmail: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.user === undefined ? activeUser : overrides.user),
    updatePasswordHash: jest.fn(),
    create: jest.fn(),
  };
  const directory: jest.Mocked<MembershipDirectoryPort> = {
    findActiveByUserId: jest.fn().mockResolvedValue(overrides.memberships ?? [membership]),
  };

  const useCase = new GetMeUseCase(users, directory);
  return { useCase, users, directory };
}

describe('GetMeUseCase (TASK-010, CON-005, AC-021)', () => {
  it('AC-021: returns the caller and only their own memberships', async () => {
    const { useCase } = setup();

    const result = await useCase.execute('u-1');

    expect(result.user).toEqual({ id: 'u-1', email: 'owner@example.com', name: 'Owner' });
    expect(result.memberships).toEqual([
      { id: 'm-1', userId: 'u-1', projectId: 'p-1', role: 'OWNER' },
    ]);
  });

  it('an empty memberships list resolves to an empty array (edge case 1)', async () => {
    const { useCase } = setup({ memberships: [] });
    const result = await useCase.execute('u-1');
    expect(result.memberships).toEqual([]);
  });

  it('a missing user throws UnauthenticatedError (defensive)', async () => {
    const { useCase } = setup({ user: null });
    await expect(useCase.execute('u-1')).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
