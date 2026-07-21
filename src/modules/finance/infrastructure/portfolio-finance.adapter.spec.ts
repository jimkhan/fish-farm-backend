import { Repository } from 'typeorm';
import { PortfolioFinanceAdapter } from './portfolio-finance.adapter';
import { FinancialTxnPersistenceModel } from './persistence/financial-txn.persistence-model';

function txn(kind: 'COST' | 'REVENUE', amountMinor: number): FinancialTxnPersistenceModel {
  const model = new FinancialTxnPersistenceModel();
  model.kind = kind;
  model.amountMinor = amountMinor;
  return model;
}

describe('PortfolioFinanceAdapter (TASK-033, MOD-03 PortfolioFinancePort)', () => {
  it('sums revenue minus cost for the given project', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([txn('REVENUE', 500000), txn('COST', 100000), txn('COST', 50000)]),
    } as unknown as jest.Mocked<Repository<FinancialTxnPersistenceModel>>;

    const adapter = new PortfolioFinanceAdapter(repository);
    const netProfitMinor = await adapter.getNetProfitMinor('p-1');

    expect(netProfitMinor).toBe(350000);
    expect(repository.find).toHaveBeenCalledWith({ where: { projectId: 'p-1' } });
  });

  it('a project with no transactions yields zero', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Repository<FinancialTxnPersistenceModel>>;

    const adapter = new PortfolioFinanceAdapter(repository);
    expect(await adapter.getNetProfitMinor('p-1')).toBe(0);
  });
});
