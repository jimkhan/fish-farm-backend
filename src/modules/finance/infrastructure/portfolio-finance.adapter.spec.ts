import { In, Repository } from 'typeorm';
import { PortfolioFinanceAdapter } from './portfolio-finance.adapter';
import { FinancialTxnPersistenceModel } from './persistence/financial-txn.persistence-model';

/**
 * Shape-level tests. The `SUM(CASE WHEN kind = 'REVENUE' ...)` itself is proven against a real
 * Postgres in `test/portfolio.e2e-spec.ts` — a mock cannot catch a wrong column name.
 */
function repositoryReturning(rows: { projectId: string; netMinor: string }[]) {
  const qb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
  const repository = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as unknown as jest.Mocked<Repository<FinancialTxnPersistenceModel>>;
  return { repository, qb };
}

describe('PortfolioFinanceAdapter (TASK-033, MOD-03 PortfolioFinancePort)', () => {
  it('returns net profit per project from one grouped SUM', async () => {
    const { repository, qb } = repositoryReturning([
      { projectId: 'p-1', netMinor: '350000' },
      { projectId: 'p-2', netMinor: '-100000' },
    ]);

    const net = await new PortfolioFinanceAdapter(repository).getNetProfitMinorFor(['p-1', 'p-2']);

    expect(net.get('p-1')).toBe(350000);
    expect(net.get('p-2')).toBe(-100000); // a loss stays negative
    expect(repository.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(qb.where).toHaveBeenCalledWith({ projectId: In(['p-1', 'p-2']) });
    expect(qb.groupBy).toHaveBeenCalledWith('txn.project_id');
  });

  it('omits a project with no transactions — the caller reads a miss as zero', async () => {
    const { repository } = repositoryReturning([{ projectId: 'p-1', netMinor: '1' }]);
    const net = await new PortfolioFinanceAdapter(repository).getNetProfitMinorFor(['p-1', 'p-new']);
    expect(net.has('p-new')).toBe(false);
  });

  it('queries nothing when the portfolio is empty', async () => {
    const { repository } = repositoryReturning([]);
    expect((await new PortfolioFinanceAdapter(repository).getNetProfitMinorFor([])).size).toBe(0);
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });
});
