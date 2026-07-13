import { Alert } from '../domain/alert.entity';
import { ListAlertsUseCase } from './list-alerts.usecase';
import { AlertRepositoryPort } from './ports/alert-repository.port';

describe('ListAlertsUseCase (TASK-015, CON-038)', () => {
  it("returns the current project's alerts", async () => {
    const alert = Alert.reconstitute({
      id: 'a-1',
      projectId: 'p-1',
      type: 'LOW_STOCK',
      severity: 'WARNING',
      state: 'RAISED',
      message: 'Feed running low',
      sourceRef: 'item-1',
      raisedAt: new Date(),
      acknowledgedAt: null,
      resolvedAt: null,
      escalatedAt: null,
    });
    const alerts: jest.Mocked<AlertRepositoryPort> = {
      findAllInCurrentProject: jest.fn().mockResolvedValue([alert]),
      findById: jest.fn(),
      findByDedupKey: jest.fn(),
      save: jest.fn(),
    };

    const useCase = new ListAlertsUseCase(alerts);
    expect(await useCase.execute()).toEqual([alert]);
  });
});
