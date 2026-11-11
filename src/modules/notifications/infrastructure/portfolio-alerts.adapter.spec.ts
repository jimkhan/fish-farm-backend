import { Not, In, Repository } from 'typeorm';
import { PortfolioAlertsAdapter } from './portfolio-alerts.adapter';
import { AlertPersistenceModel } from './persistence/alert.persistence-model';

/**
 * Shape-level tests. The grouped SQL itself is proven against a real Postgres in
 * `test/portfolio.e2e-spec.ts` — a mock cannot catch a wrong column name or a bad GROUP BY.
 */
function repositoryReturning(rows: { projectId: string; count: string }[]) {
  const qb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
  const repository = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as unknown as jest.Mocked<Repository<AlertPersistenceModel>>;
  return { repository, qb };
}

describe('PortfolioAlertsAdapter (TASK-012, MOD-03 PortfolioAlertsPort)', () => {
  it('counts CRITICAL, non-RESOLVED alerts per project in one grouped query', async () => {
    const { repository, qb } = repositoryReturning([
      { projectId: 'p-1', count: '2' },
      { projectId: 'p-2', count: '5' },
    ]);

    const counts = await new PortfolioAlertsAdapter(repository).countOpenCriticalFor(['p-1', 'p-2']);

    expect(counts.get('p-1')).toBe(2);
    expect(counts.get('p-2')).toBe(5);
    expect(repository.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(qb.where).toHaveBeenCalledWith({
      projectId: In(['p-1', 'p-2']),
      severity: 'CRITICAL',
      state: Not('RESOLVED'),
    });
    expect(qb.groupBy).toHaveBeenCalledWith('alert.project_id');
  });

  it('omits a project with no open critical alerts — the caller reads a miss as zero', async () => {
    const { repository } = repositoryReturning([{ projectId: 'p-1', count: '1' }]);
    const counts = await new PortfolioAlertsAdapter(repository).countOpenCriticalFor(['p-1', 'p-quiet']);
    expect(counts.has('p-quiet')).toBe(false);
  });

  it('queries nothing when the portfolio is empty', async () => {
    const { repository } = repositoryReturning([]);
    expect((await new PortfolioAlertsAdapter(repository).countOpenCriticalFor([])).size).toBe(0);
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });
});
