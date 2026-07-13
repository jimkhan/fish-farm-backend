import { Not, Repository } from 'typeorm';
import { PortfolioAlertsAdapter } from './portfolio-alerts.adapter';
import { AlertPersistenceModel } from './persistence/alert.persistence-model';

describe('PortfolioAlertsAdapter (TASK-012, MOD-03 PortfolioAlertsPort)', () => {
  it('counts CRITICAL, non-RESOLVED alerts for the given project', async () => {
    const repository = {
      count: jest.fn().mockResolvedValue(2),
    } as unknown as jest.Mocked<Repository<AlertPersistenceModel>>;

    const adapter = new PortfolioAlertsAdapter(repository);
    const count = await adapter.countOpenCritical('p-1');

    expect(count).toBe(2);
    expect(repository.count).toHaveBeenCalledWith({
      where: { projectId: 'p-1', severity: 'CRITICAL', state: Not('RESOLVED') },
    });
  });
});
