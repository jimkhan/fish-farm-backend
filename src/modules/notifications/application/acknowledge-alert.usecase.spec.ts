import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { ForbiddenError, NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { ProjectRole } from '../../../shared-kernel/tenant/membership-resolver.port';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { Alert } from '../domain/alert.entity';
import { AcknowledgeAlertUseCase } from './acknowledge-alert.usecase';
import { AlertRepositoryPort } from './ports/alert-repository.port';

function alertFixture(overrides: Partial<Parameters<typeof Alert.reconstitute>[0]> = {}) {
  return Alert.reconstitute({
    id: 'a-1',
    projectId: 'p-1',
    type: 'WATER_THRESHOLD',
    severity: 'WARNING',
    state: 'RAISED',
    message: 'DO low',
    sourceRef: 'pond-1',
    raisedAt: new Date(),
    acknowledgedAt: null,
    resolvedAt: null,
    escalatedAt: null,
    ...overrides,
  });
}

function setup(overrides: { alert?: Alert | null; role?: ProjectRole } = {}) {
  const alerts: jest.Mocked<AlertRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest
      .fn()
      .mockResolvedValue(overrides.alert === undefined ? alertFixture() : overrides.alert),
    findByDedupKey: jest.fn(),
    save: jest.fn().mockImplementation(async (a: Alert) => a),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as DomainEventBus;
  const tenant = new TenantContext({
    tenant: { userId: 'u-1', projectId: 'p-1', role: overrides.role ?? 'OWNER' },
  });

  const useCase = new AcknowledgeAlertUseCase(alerts, events, tenant);
  return { useCase, alerts, events };
}

describe('AcknowledgeAlertUseCase (TASK-015, CON-039, AC-051/059, R7/R8)', () => {
  it('an Owner acknowledges any alert type', async () => {
    const { useCase, alerts, events } = setup({ role: 'OWNER' });
    const acked = await useCase.execute('a-1');
    expect(acked.state).toBe('ACKNOWLEDGED');
    expect(alerts.save).toHaveBeenCalledTimes(1);
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'AlertAcknowledged', alertId: 'a-1' }),
    );
  });

  it('a Worker acknowledges an operational alert', async () => {
    const { useCase } = setup({ role: 'WORKER', alert: alertFixture({ type: 'MISSED_TASK' }) });
    const acked = await useCase.execute('a-1');
    expect(acked.state).toBe('ACKNOWLEDGED');
  });

  it('AC-059: a Worker cannot acknowledge a non-operational alert', async () => {
    const { useCase, alerts } = setup({
      role: 'WORKER',
      alert: alertFixture({ type: 'WATER_EMERGENCY' }),
    });
    await expect(useCase.execute('a-1')).rejects.toBeInstanceOf(ForbiddenError);
    expect(alerts.save).not.toHaveBeenCalled();
  });

  it('AC-059: a Partner can never acknowledge, with the read-only message', async () => {
    const { useCase } = setup({ role: 'PARTNER' });
    const promise = useCase.execute('a-1');
    await expect(promise).rejects.toBeInstanceOf(ForbiddenError);
    await expect(promise).rejects.toThrow('Partners have read-only access.');
  });

  it('edge case 4: acknowledging an already-ACKNOWLEDGED alert is a no-op (no save/publish)', async () => {
    const { useCase, alerts, events } = setup({ alert: alertFixture({ state: 'ACKNOWLEDGED' }) });
    const result = await useCase.execute('a-1');
    expect(result.state).toBe('ACKNOWLEDGED');
    expect(alerts.save).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('edge case 4: acknowledging a RESOLVED alert is a no-op, not an error', async () => {
    const { useCase, alerts } = setup({ alert: alertFixture({ state: 'RESOLVED' }) });
    const result = await useCase.execute('a-1');
    expect(result.state).toBe('RESOLVED');
    expect(alerts.save).not.toHaveBeenCalled();
  });

  it('an unknown or cross-project alert throws NotFoundError', async () => {
    const { useCase } = setup({ alert: null });
    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});
