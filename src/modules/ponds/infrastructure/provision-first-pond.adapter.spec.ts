import { Repository } from 'typeorm';
import { TransactionContext } from '../../../platform/persistence/transaction-context';
import { ProvisionFirstPondAdapter } from './provision-first-pond.adapter';
import { PondPersistenceModel } from './persistence/pond.persistence-model';

describe('ProvisionFirstPondAdapter (TASK-018, MOD-03 ProvisionFirstPondPort, AC-032/068)', () => {
  it('saves a pond row for the given projectId, defaulting depthM/notes to null', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const repository = { save } as unknown as jest.Mocked<Repository<PondPersistenceModel>>;
    const transactions = { manager: undefined } as unknown as TransactionContext;

    const adapter = new ProvisionFirstPondAdapter(repository, transactions);
    await adapter.create('project-1', { name: 'First Pond', area: 10 });

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        name: 'First Pond',
        area: 10,
        depthM: null,
        notes: null,
      }),
    );
  });

  it('joins the ambient transaction manager when one is open (TASK-005)', async () => {
    const scopedSave = jest.fn().mockResolvedValue(undefined);
    const scopedRepo = { save: scopedSave };
    const manager = { getRepository: jest.fn().mockReturnValue(scopedRepo) };
    const repository = {} as unknown as jest.Mocked<Repository<PondPersistenceModel>>;
    const transactions = { manager } as unknown as TransactionContext;

    const adapter = new ProvisionFirstPondAdapter(repository, transactions);
    await adapter.create('project-1', { name: 'First Pond', area: 10 });

    expect(manager.getRepository).toHaveBeenCalledWith(PondPersistenceModel);
    expect(scopedSave).toHaveBeenCalledTimes(1);
  });
});
