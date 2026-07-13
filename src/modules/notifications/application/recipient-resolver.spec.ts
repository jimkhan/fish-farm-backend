import { ProjectMembership } from '../../identity/domain/project-membership.entity';
import { ProjectMembersDirectoryPort } from '../../identity/application/ports/project-members-directory.port';
import { RecipientResolver } from './recipient-resolver';

function membership(userId: string, role: 'OWNER' | 'WORKER' | 'PARTNER') {
  return ProjectMembership.reconstitute({
    id: `m-${userId}`,
    userId,
    projectId: 'p-1',
    role,
    status: 'ACTIVE',
    createdAt: new Date(),
  });
}

function setup(memberships: ProjectMembership[]) {
  const members: jest.Mocked<ProjectMembersDirectoryPort> = {
    findActiveByProjectId: jest.fn().mockResolvedValue(memberships),
  };
  return { resolver: new RecipientResolver(members), members };
}

describe('RecipientResolver (TASK-015, MOD-09 R2 recipient policy)', () => {
  it('the Owner is always a recipient, for any alert type', async () => {
    const { resolver } = setup([membership('owner-1', 'OWNER')]);
    const recipients = await resolver.resolve('p-1', 'WATER_EMERGENCY');
    expect(recipients).toEqual(['owner-1']);
  });

  it('the Worker is a recipient for operational types (WATER_THRESHOLD/LOW_STOCK/MISSED_TASK)', async () => {
    const { resolver } = setup([membership('worker-1', 'WORKER')]);
    for (const type of ['WATER_THRESHOLD', 'LOW_STOCK', 'MISSED_TASK'] as const) {
      expect(await resolver.resolve('p-1', type)).toEqual(['worker-1']);
    }
  });

  it('the Worker is NOT a recipient for non-operational types (WATER_EMERGENCY/ABNORMAL_MORTALITY)', async () => {
    const { resolver } = setup([membership('worker-1', 'WORKER')]);
    expect(await resolver.resolve('p-1', 'WATER_EMERGENCY')).toEqual([]);
    expect(await resolver.resolve('p-1', 'ABNORMAL_MORTALITY')).toEqual([]);
  });

  it('the Partner is never a recipient, for any alert type', async () => {
    const { resolver } = setup([membership('partner-1', 'PARTNER')]);
    expect(await resolver.resolve('p-1', 'MISSED_TASK')).toEqual([]);
    expect(await resolver.resolve('p-1', 'WATER_EMERGENCY')).toEqual([]);
  });

  it('resolves a mixed membership correctly for an operational alert', async () => {
    const { resolver } = setup([
      membership('owner-1', 'OWNER'),
      membership('worker-1', 'WORKER'),
      membership('partner-1', 'PARTNER'),
    ]);
    const recipients = await resolver.resolve('p-1', 'LOW_STOCK');
    expect(recipients.sort()).toEqual(['owner-1', 'worker-1'].sort());
  });
});
