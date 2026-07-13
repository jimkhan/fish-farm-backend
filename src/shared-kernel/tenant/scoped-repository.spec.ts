import { EntityManager, Repository } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../platform/persistence/base-project-owned.persistence-model';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { ScopeRequiredError } from '../errors/domain-error';
import { ScopedRepository } from './scoped-repository';
import { TenantContext } from './tenant-context';

class WidgetModel extends BaseProjectOwnedPersistenceModel {
  name!: string;
}

function mockRepo(): jest.Mocked<
  Pick<Repository<WidgetModel>, 'find' | 'findOne' | 'count' | 'save' | 'delete'>
> {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    save: jest.fn().mockImplementation(async (e: WidgetModel) => e),
    delete: jest.fn().mockResolvedValue({ affected: 1, raw: undefined }),
  };
}

const boundCtx = new TenantContext({
  tenant: { userId: 'u-1', projectId: 'p-1', role: 'OWNER' },
});

describe('ScopedRepository (TASK-004, FT-004, ADR-006)', () => {
  it('composes project_id into every read (AC-003)', async () => {
    const repo = mockRepo();
    const scoped = new ScopedRepository(repo as unknown as Repository<WidgetModel>, boundCtx);

    await scoped.find({ name: 'w' });
    expect(repo.find).toHaveBeenCalledWith({ where: { name: 'w', projectId: 'p-1' } });

    await scoped.findOneById('id-1');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'id-1', projectId: 'p-1' } });

    await scoped.count();
    expect(repo.count).toHaveBeenCalledWith({ where: { projectId: 'p-1' } });
  });

  it('stamps writes with the TenantContext project_id, ignoring a client-set value (AC-014)', async () => {
    const repo = mockRepo();
    const scoped = new ScopedRepository(repo as unknown as Repository<WidgetModel>, boundCtx);

    const hostile = new WidgetModel();
    hostile.name = 'w';
    hostile.projectId = 'someone-elses-project';

    const saved = await scoped.save(hostile);
    expect(saved.projectId).toBe('p-1');
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p-1' }));
  });

  it('scopes deletes and reports whether a row was removed', async () => {
    const repo = mockRepo();
    const scoped = new ScopedRepository(repo as unknown as Repository<WidgetModel>, boundCtx);

    await expect(scoped.deleteById('id-1')).resolves.toBe(true);
    expect(repo.delete).toHaveBeenCalledWith({ id: 'id-1', projectId: 'p-1' });
  });

  it('joins the active request transaction when one is bound (TASK-005, AC-006)', async () => {
    const baseRepo = mockRepo();
    const txRepo = mockRepo();
    const manager = { getRepository: jest.fn().mockReturnValue(txRepo) };
    const transactions = new TransactionContext();

    const scoped = new ScopedRepository(
      { ...baseRepo, target: WidgetModel } as unknown as Repository<WidgetModel>,
      boundCtx,
      transactions,
    );

    // outside a transaction → base repository
    await scoped.find();
    expect(baseRepo.find).toHaveBeenCalledTimes(1);
    expect(txRepo.find).not.toHaveBeenCalled();

    // inside a transaction → the transactional manager's repository
    await transactions.run(manager as unknown as EntityManager, async () => scoped.find());
    expect(manager.getRepository).toHaveBeenCalledWith(WidgetModel);
    expect(txRepo.find).toHaveBeenCalledWith({ where: { projectId: 'p-1' } });
    expect(baseRepo.find).toHaveBeenCalledTimes(1); // unchanged
  });

  it('throws SCOPE_REQUIRED before touching the repository when no scope is bound (AC-005)', async () => {
    const repo = mockRepo();
    const scoped = new ScopedRepository(
      repo as unknown as Repository<WidgetModel>,
      new TenantContext({}),
    );

    await expect(scoped.find()).rejects.toThrow(ScopeRequiredError);
    await expect(scoped.save(new WidgetModel())).rejects.toThrow(ScopeRequiredError);
    expect(repo.find).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
