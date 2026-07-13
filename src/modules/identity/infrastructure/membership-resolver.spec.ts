import { Repository } from 'typeorm';
import { MembershipResolver } from './membership-resolver';
import { ProjectMembershipPersistenceModel } from './persistence/project-membership.persistence-model';

function modelFor(overrides: Partial<ProjectMembershipPersistenceModel> = {}) {
  const model = new ProjectMembershipPersistenceModel();
  model.id = 'm-1';
  model.projectId = 'p-1';
  model.userId = 'u-1';
  model.role = 'OWNER';
  model.status = 'ACTIVE';
  model.createdAt = new Date();
  return Object.assign(model, overrides);
}

function setup(models: ProjectMembershipPersistenceModel[]) {
  const repository = {
    find: jest.fn().mockResolvedValue(models),
  } as unknown as jest.Mocked<Repository<ProjectMembershipPersistenceModel>>;
  const resolver = new MembershipResolver(repository);
  return { resolver, repository };
}

describe('MembershipResolver (TASK-010, MOD-01 §4.6/AC-022, cross-project)', () => {
  it('resolve() queries only ACTIVE memberships for the given user and returns minimal views', async () => {
    const { resolver, repository } = setup([modelFor()]);

    const result = await resolver.resolve('u-1');

    expect(repository.find).toHaveBeenCalledWith({ where: { userId: 'u-1', status: 'ACTIVE' } });
    expect(result).toEqual([{ projectId: 'p-1', role: 'OWNER' }]);
  });

  it('findActiveByUserId() returns full domain entities for the same query', async () => {
    const { resolver } = setup([modelFor()]);

    const result = await resolver.findActiveByUserId('u-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m-1');
    expect(result[0].projectId).toBe('p-1');
    expect(result[0].role).toBe('OWNER');
  });

  it('AC-022: a user with memberships in projects A and B resolves exactly those pairs', async () => {
    const { resolver } = setup([
      modelFor({ id: 'm-a', projectId: 'p-a', role: 'OWNER' }),
      modelFor({ id: 'm-b', projectId: 'p-b', role: 'PARTNER' }),
    ]);

    const result = await resolver.resolve('u-1');
    expect(result).toEqual([
      { projectId: 'p-a', role: 'OWNER' },
      { projectId: 'p-b', role: 'PARTNER' },
    ]);
  });
});
