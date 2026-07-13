import { Repository } from 'typeorm';
import { TransactionContext } from '../../../platform/persistence/transaction-context';
import { InitialOwnerMembership } from './initial-owner-membership';
import { ProjectMembershipPersistenceModel } from './persistence/project-membership.persistence-model';

describe('InitialOwnerMembership (TASK-011, MOD-03 §4.4)', () => {
  it('saves an ACTIVE OWNER membership row for the given user/project', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const repository = { save } as unknown as jest.Mocked<
      Repository<ProjectMembershipPersistenceModel>
    >;
    const transactions = { manager: undefined } as unknown as TransactionContext;

    const infra = new InitialOwnerMembership(repository, transactions);
    await infra.createForNewProject('user-1', 'project-1');

    expect(save).toHaveBeenCalledWith({
      userId: 'user-1',
      projectId: 'project-1',
      role: 'OWNER',
      status: 'ACTIVE',
    });
  });

  it('joins the ambient transaction manager when one is open (TASK-005)', async () => {
    const scopedSave = jest.fn().mockResolvedValue(undefined);
    const scopedRepo = { save: scopedSave };
    const manager = { getRepository: jest.fn().mockReturnValue(scopedRepo) };
    const repository = {} as unknown as jest.Mocked<Repository<ProjectMembershipPersistenceModel>>;
    const transactions = { manager } as unknown as TransactionContext;

    const infra = new InitialOwnerMembership(repository, transactions);
    await infra.createForNewProject('user-1', 'project-1');

    expect(manager.getRepository).toHaveBeenCalledWith(ProjectMembershipPersistenceModel);
    expect(scopedSave).toHaveBeenCalledTimes(1);
  });
});
