import { Alert } from '../domain/alert.entity';
import { DeviceToken } from '../domain/device-token.entity';
import { DeliveryService } from './delivery.service';
import { CRITICAL_SLA_MINUTES, SlaEscalationScheduler } from './sla-escalation.scheduler';
import { AlertEventRepositoryPort } from './ports/alert-event-repository.port';
import { DeviceTokenRepositoryPort } from './ports/device-token-repository.port';
import { RecipientResolver } from './recipient-resolver';

function overdueAlert(overrides: Partial<Parameters<typeof Alert.reconstitute>[0]> = {}) {
  return Alert.reconstitute({
    id: 'a-1',
    projectId: 'p-1',
    type: 'WATER_EMERGENCY',
    severity: 'CRITICAL',
    state: 'SENT',
    message: 'DO crash',
    sourceRef: 'pond-1',
    raisedAt: new Date(Date.now() - (CRITICAL_SLA_MINUTES + 5) * 60_000),
    acknowledgedAt: null,
    resolvedAt: null,
    escalatedAt: null,
    ...overrides,
  });
}

function device(userId: string, fcmToken: string) {
  return DeviceToken.reconstitute({
    id: `d-${fcmToken}`,
    userId,
    fcmToken,
    platform: 'ANDROID',
    registeredAt: new Date(),
  });
}

function setup(overrides: {
  overdue?: Alert[];
  userIds?: string[];
  devicesByUser?: Record<string, DeviceToken[]>;
} = {}) {
  const alerts: jest.Mocked<AlertEventRepositoryPort> = {
    findActiveByDedupKey: jest.fn(),
    findById: jest.fn(),
    findCriticalUnacknowledgedPastSla: jest.fn().mockResolvedValue(overrides.overdue ?? [overdueAlert()]),
    save: jest.fn().mockImplementation(async (a: Alert) => a),
  };
  const devices: jest.Mocked<DeviceTokenRepositoryPort> = {
    findByUserId: jest
      .fn()
      .mockImplementation(async (userId: string) => overrides.devicesByUser?.[userId] ?? []),
    findByFcmToken: jest.fn(),
    save: jest.fn(),
  };
  const recipients = {
    resolve: jest.fn().mockResolvedValue(overrides.userIds ?? ['owner-1']),
  } as unknown as RecipientResolver;
  const delivery = { deliver: jest.fn().mockResolvedValue(true) } as unknown as jest.Mocked<DeliveryService>;

  const scheduler = new SlaEscalationScheduler(alerts, devices, recipients, delivery);
  return { scheduler, alerts, devices, recipients, delivery };
}

describe('SlaEscalationScheduler (TASK-017, F3/R7, AC-054)', () => {
  it('re-dispatches to every registered device of a CRITICAL alert past the SLA', async () => {
    const { scheduler, delivery } = setup({
      userIds: ['owner-1'],
      devicesByUser: { 'owner-1': [device('owner-1', 'fcm-owner')] },
    });
    await scheduler.scan();
    expect(delivery.deliver).toHaveBeenCalledWith('a-1', 'fcm-owner', expect.any(Object));
  });

  it('marks the alert escalated after re-notifying', async () => {
    const { scheduler, alerts } = setup();
    await scheduler.scan();
    expect(alerts.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-1', escalatedAt: expect.any(Date) }));
  });

  it('escalates even with zero registered devices — the attempt to resolve recipients still runs', async () => {
    const { scheduler, alerts, delivery } = setup({ userIds: [] });
    await scheduler.scan();
    expect(delivery.deliver).not.toHaveBeenCalled();
    expect(alerts.save).toHaveBeenCalledWith(expect.objectContaining({ escalatedAt: expect.any(Date) }));
  });

  it('does nothing when there are no overdue alerts', async () => {
    const { scheduler, alerts, delivery } = setup({ overdue: [] });
    await scheduler.scan();
    expect(delivery.deliver).not.toHaveBeenCalled();
    expect(alerts.save).not.toHaveBeenCalled();
  });

  it('processes multiple overdue alerts independently', async () => {
    const { scheduler, alerts } = setup({
      overdue: [overdueAlert({ id: 'a-1' }), overdueAlert({ id: 'a-2', projectId: 'p-2' })],
    });
    await scheduler.scan();
    expect(alerts.save).toHaveBeenCalledTimes(2);
  });
});
