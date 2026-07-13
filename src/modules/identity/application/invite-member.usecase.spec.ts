import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { ProjectMembership } from '../domain/project-membership.entity';
import { User } from '../domain/user.entity';
import { WorkerAlreadyAssignedError } from '../domain/identity-errors';
import { InviteMemberUseCase } from './invite-member.usecase';
import { MembershipDirectoryPort } from './ports/membership-directory.port';
import { PasswordHasherPort } from './ports/password-hasher.port';
import { ProjectMembershipRepositoryPort } from './ports/project-membership-repository.port';
import { UserRepositoryPort } from './ports/user-repository.port';

const existingUser = User.reconstitute({
  id: 'u-1',
  email: 'existing@example.com',
  name: 'Existing',
  passwordHash: 'hash',
  status: 'ACTIVE',
  createdAt: new Date(),
});

function membershipIn(projectId: string, role: 'OWNER' | 'WORKER' | 'PARTNER' = 'WORKER') {
  return ProjectMembership.reconstitute({
    id: `m-${projectId}`,
    userId: 'u-1',
    projectId,
    role,
    status: 'ACTIVE',
    createdAt: new Date(),
  });
}

function setup(
  overrides: {
    user?: User | null;
    existingMemberships?: ProjectMembership[];
    createdUser?: User;
  } = {},
) {
  const users: jest.Mocked<UserRepositoryPort> = {
    findByEmail: jest.fn().mockResolvedValue(overrides.user === undefined ? existingUser : overrides.user),
    findById: jest.fn(),
    updatePasswordHash: jest.fn(),
    create: jest.fn().mockResolvedValue(
      overrides.createdUser ??
        User.reconstitute({
          id: 'u-new',
          email: 'new@example.com',
          name: 'new@example.com',
          passwordHash: 'random-hash',
          status: 'ACTIVE',
          createdAt: new Date(),
        }),
    ),
  };
  const hasher: jest.Mocked<PasswordHasherPort> = {
    hash: jest.fn().mockResolvedValue('unusable-hash'),
    verify: jest.fn(),
  };
  const directory: jest.Mocked<MembershipDirectoryPort> = {
    findActiveByUserId: jest.fn().mockResolvedValue(overrides.existingMemberships ?? []),
  };
  const memberships: jest.Mocked<ProjectMembershipRepositoryPort> = {
    findActiveByProjectId: jest.fn(),
    countActiveOwners: jest.fn(),
    findById: jest.fn(),
    save: jest.fn().mockImplementation(async (m: ProjectMembership) => m),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as DomainEventBus;
  const tenant = new TenantContext({ tenant: { userId: 'owner-1', projectId: 'p-target', role: 'OWNER' } });

  const useCase = new InviteMemberUseCase(users, hasher, directory, memberships, events, tenant);
  return { useCase, users, hasher, directory, memberships, events };
}

describe('InviteMemberUseCase (TASK-010, CON-011, AC-024/029, R4/R8/R9)', () => {
  it('creates a membership for an existing user and publishes MemberInvited', async () => {
    const { useCase, memberships, events } = setup();

    const result = await useCase.execute('existing@example.com', 'WORKER');

    expect(result.userId).toBe('u-1');
    expect(result.projectId).toBe('p-target');
    expect(result.role).toBe('WORKER');
    expect(memberships.save).toHaveBeenCalledTimes(1);
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'MemberInvited', userId: 'u-1', role: 'WORKER' }),
    );
  });

  it('R8: an unknown email gets a pending account created with an unusable random password', async () => {
    const { useCase, users, hasher } = setup({ user: null });

    await useCase.execute('new@example.com', 'PARTNER');

    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', passwordHash: 'unusable-hash' }),
    );
    expect(hasher.hash).toHaveBeenCalled();
  });

  it('AC-029: an existing user with memberships in other projects only gains membership in the target project', async () => {
    const { useCase, memberships } = setup({
      existingMemberships: [membershipIn('p-other-a', 'OWNER'), membershipIn('p-other-b', 'PARTNER')],
    });

    const result = await useCase.execute('existing@example.com', 'WORKER');

    expect(result.projectId).toBe('p-target');
    expect(memberships.save).toHaveBeenCalledTimes(1);
    const saved = memberships.save.mock.calls[0][0] as ProjectMembership;
    expect(saved.projectId).toBe('p-target');
  });

  it('edge case 9: an active membership already in this project is returned idempotently, no duplicate created', async () => {
    const { useCase, memberships } = setup({
      existingMemberships: [membershipIn('p-target', 'WORKER')],
    });

    const result = await useCase.execute('existing@example.com', 'WORKER');

    expect(result.projectId).toBe('p-target');
    expect(memberships.save).not.toHaveBeenCalled();
  });

  it('AC-024/R4: assigning WORKER to a user already an active Worker elsewhere is rejected', async () => {
    const { useCase, memberships } = setup({
      existingMemberships: [membershipIn('p-other', 'WORKER')],
    });

    await expect(useCase.execute('existing@example.com', 'WORKER')).rejects.toBeInstanceOf(
      WorkerAlreadyAssignedError,
    );
    expect(memberships.save).not.toHaveBeenCalled();
  });

  it('a user already an active Owner elsewhere may still be assigned Worker here (R4 is Worker-role-specific)', async () => {
    const { useCase, memberships } = setup({
      existingMemberships: [membershipIn('p-other', 'OWNER')],
    });

    const result = await useCase.execute('existing@example.com', 'WORKER');
    expect(result.role).toBe('WORKER');
    expect(memberships.save).toHaveBeenCalledTimes(1);
  });
});
