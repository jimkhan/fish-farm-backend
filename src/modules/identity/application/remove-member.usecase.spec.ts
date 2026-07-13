import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { ProjectMembership } from '../domain/project-membership.entity';
import { LastOwnerError } from '../domain/identity-errors';
import { RemoveMemberUseCase } from './remove-member.usecase';
import { ProjectMembershipRepositoryPort } from './ports/project-membership-repository.port';

function activeMembership(role: 'OWNER' | 'WORKER' | 'PARTNER' = 'WORKER') {
  return ProjectMembership.reconstitute({
    id: 'm-1',
    userId: 'u-1',
    projectId: 'p-1',
    role,
    status: 'ACTIVE',
    createdAt: new Date(),
  });
}

function setup(
  overrides: { membership?: ProjectMembership | null; activeOwners?: number } = {},
) {
  const memberships: jest.Mocked<ProjectMembershipRepositoryPort> = {
    findActiveByProjectId: jest.fn(),
    countActiveOwners: jest.fn().mockResolvedValue(overrides.activeOwners ?? 2),
    findById: jest
      .fn()
      .mockResolvedValue(overrides.membership === undefined ? activeMembership() : overrides.membership),
    save: jest.fn().mockImplementation(async (m: ProjectMembership) => m),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as DomainEventBus;

  const useCase = new RemoveMemberUseCase(memberships, events);
  return { useCase, memberships, events };
}

describe('RemoveMemberUseCase (TASK-010, CON-012, AC-027, R7)', () => {
  it('soft-removes a non-Owner membership and publishes MemberRemoved', async () => {
    const { useCase, memberships, events } = setup();

    await useCase.execute('m-1');

    expect(memberships.save).toHaveBeenCalledTimes(1);
    const saved = memberships.save.mock.calls[0][0] as ProjectMembership;
    expect(saved.status).toBe('REMOVED');
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'MemberRemoved', membershipId: 'm-1' }),
    );
  });

  it('removes an Owner membership when another active Owner remains', async () => {
    const { useCase, memberships } = setup({
      membership: activeMembership('OWNER'),
      activeOwners: 2,
    });

    await useCase.execute('m-1');
    expect(memberships.save).toHaveBeenCalledTimes(1);
  });

  it('AC-027/R7: removing the last active Owner is rejected', async () => {
    const { useCase, memberships } = setup({
      membership: activeMembership('OWNER'),
      activeOwners: 1,
    });

    await expect(useCase.execute('m-1')).rejects.toBeInstanceOf(LastOwnerError);
    expect(memberships.save).not.toHaveBeenCalled();
  });

  it('an unknown or cross-project membership id throws NotFoundError', async () => {
    const { useCase } = setup({ membership: null });
    await expect(useCase.execute('m-missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('an already-removed membership throws NotFoundError (no double-remove)', async () => {
    const { useCase } = setup({
      membership: activeMembership().remove(),
    });
    await expect(useCase.execute('m-1')).rejects.toBeInstanceOf(NotFoundError);
  });
});
