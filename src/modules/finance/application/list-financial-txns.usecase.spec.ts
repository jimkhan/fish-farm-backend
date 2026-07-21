import { FinancialTxn } from '../domain/financial-txn.entity';
import { FinancialTxnRepositoryPort } from './ports/financial-txn-repository.port';
import { ListFinancialTxnsUseCase } from './list-financial-txns.usecase';

describe('ListFinancialTxnsUseCase (TASK-032, CON-032, AC-115)', () => {
  it('returns the current project scoped transactions', async () => {
    const txn = FinancialTxn.reconstitute({
      id: 't-1',
      projectId: 'p-1',
      kind: 'COST',
      category: 'FEED',
      amountMinor: 1000,
      occurredOn: new Date(),
      sourceRef: null,
      note: null,
      createdAt: new Date(),
    });
    const txns: jest.Mocked<FinancialTxnRepositoryPort> = {
      findAllInCurrentProject: jest.fn().mockResolvedValue([txn]),
      save: jest.fn(),
    };

    const useCase = new ListFinancialTxnsUseCase(txns);
    const result = await useCase.execute();
    expect(result).toEqual([txn]);
  });
});
