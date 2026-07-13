import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { Alert } from '../domain/alert.entity';
import { RaiseAlertUseCase } from './raise-alert.usecase';
import { AlertEventRepositoryPort } from './ports/alert-event-repository.port';

function setup(overrides: { existing?: Alert | null } = {}) {
  const alerts: jest.Mocked<AlertEventRepositoryPort> = {
    findActiveByDedupKey: jest
      .fn()
      .mockResolvedValue(overrides.existing === undefined ? null : overrides.existing),
    findById: jest.fn(),
    findCriticalUnacknowledgedPastSla: jest.fn(),
    save: jest.fn().mockImplementation(async (a: Alert) => a),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as DomainEventBus;

  const useCase = new RaiseAlertUseCase(alerts, events);
  return { useCase, alerts, events };
}

describe('RaiseAlertUseCase (TASK-015, MOD-09 F1, AC-050/055/058, R4/R5)', () => {
  it('AC-050: raises a new alert in RAISED state with the given type/severity', async () => {
    const { useCase, alerts } = setup();

    const alert = await useCase.execute({
      projectId: 'p-1',
      type: 'WATER_THRESHOLD',
      severity: 'WARNING',
      sourceRef: 'pond-1',
      message: 'DO low',
    });

    expect(alert.state).toBe('RAISED');
    expect(alert.type).toBe('WATER_THRESHOLD');
    expect(alert.severity).toBe('WARNING');
    expect(alerts.save).toHaveBeenCalledTimes(1);
  });

  it('publishes AlertRaised for a new alert', async () => {
    const { useCase, events } = setup();
    const alert = await useCase.execute({
      projectId: 'p-1',
      type: 'LOW_STOCK',
      severity: 'WARNING',
      sourceRef: 'item-1',
      message: 'Feed running low',
    });
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'AlertRaised', alertId: alert.id }),
    );
  });

  it('AC-055/058: an identical-severity repeat (dedup match) returns the existing alert, no new save/publish', async () => {
    const existing = Alert.reconstitute({
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
    });
    const { useCase, alerts, events } = setup({ existing });

    const result = await useCase.execute({
      projectId: 'p-1',
      type: 'WATER_THRESHOLD',
      severity: 'WARNING',
      sourceRef: 'pond-1',
      message: 'DO low again',
    });

    expect(result).toBe(existing);
    expect(alerts.save).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('R4: a higher-severity repeat uplifts the existing alert in place instead of creating a duplicate', async () => {
    const existing = Alert.reconstitute({
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
    });
    const { useCase, alerts, events } = setup({ existing });

    const result = await useCase.execute({
      projectId: 'p-1',
      type: 'WATER_THRESHOLD',
      severity: 'CRITICAL',
      sourceRef: 'pond-1',
      message: 'DO critical',
    });

    expect(result.id).toBe('a-1');
    expect(result.severity).toBe('CRITICAL');
    expect(alerts.save).toHaveBeenCalledTimes(1);
    // Uplift isn't a fresh AlertRaised — it's the same alert, not a new one.
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('a re-breach after the previous alert resolved is a genuinely new alert (not deduped)', async () => {
    const { useCase, alerts } = setup({ existing: null }); // findActiveByDedupKey excludes RESOLVED
    await useCase.execute({
      projectId: 'p-1',
      type: 'WATER_THRESHOLD',
      severity: 'WARNING',
      sourceRef: 'pond-1',
      message: 'DO low again',
    });
    expect(alerts.save).toHaveBeenCalledTimes(1);
  });
});
