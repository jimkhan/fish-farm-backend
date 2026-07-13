import { AlertRaised } from '@fish-farm/shared';
import { Alert } from '../domain/alert.entity';
import { DeviceToken } from '../domain/device-token.entity';
import { DeliveryService } from './delivery.service';
import { OnAlertRaisedHandler } from './on-alert-raised.handler';
import { AlertEventRepositoryPort } from './ports/alert-event-repository.port';
import { DeviceTokenRepositoryPort } from './ports/device-token-repository.port';
import { RecipientResolver } from './recipient-resolver';

function alert(overrides: Partial<Parameters<typeof Alert.reconstitute>[0]> = {}) {
  return Alert.reconstitute({
    id: 'a-1',
    projectId: 'p-1',
    type: 'WATER_EMERGENCY',
    severity: 'CRITICAL',
    state: 'RAISED',
    message: 'DO crash',
    sourceRef: 'pond-1',
    raisedAt: new Date(),
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

function setup(
  overrides: {
    userIds?: string[];
    devicesByUser?: Record<string, DeviceToken[]>;
    existingAlert?: Alert | null;
  } = {},
) {
  const delivery = {
    deliver: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<DeliveryService>;
  const devices: jest.Mocked<DeviceTokenRepositoryPort> = {
    findByUserId: jest
      .fn()
      .mockImplementation(async (userId: string) => overrides.devicesByUser?.[userId] ?? []),
    findByFcmToken: jest.fn(),
    save: jest.fn(),
  };
  const alerts: jest.Mocked<AlertEventRepositoryPort> = {
    findActiveByDedupKey: jest.fn(),
    findById: jest
      .fn()
      .mockResolvedValue(overrides.existingAlert === undefined ? alert() : overrides.existingAlert),
    findCriticalUnacknowledgedPastSla: jest.fn(),
    save: jest.fn().mockImplementation(async (a: Alert) => a),
  };
  const recipients = {
    resolve: jest.fn().mockResolvedValue(overrides.userIds ?? ['owner-1']),
  } as unknown as RecipientResolver;

  const handler = new OnAlertRaisedHandler(delivery, devices, alerts, recipients);
  return { handler, delivery, devices, alerts, recipients };
}

const event: AlertRaised = {
  name: 'AlertRaised',
  eventId: 'e-1',
  occurredAt: new Date(),
  projectId: 'p-1',
  alertId: 'a-1',
  alertType: 'WATER_EMERGENCY',
  severity: 'CRITICAL',
};

describe('OnAlertRaisedHandler (TASK-016/017, F2/F3, AC-053/052)', () => {
  it('dispatches to every registered device of every resolved recipient via DeliveryService', async () => {
    const { handler, delivery } = setup({
      userIds: ['owner-1', 'worker-1'],
      devicesByUser: {
        'owner-1': [device('owner-1', 'fcm-owner')],
        'worker-1': [device('worker-1', 'fcm-worker-1'), device('worker-1', 'fcm-worker-2')],
      },
    });
    await handler.handle(event);
    expect(delivery.deliver).toHaveBeenCalledTimes(3);
    expect(delivery.deliver).toHaveBeenCalledWith('a-1', 'fcm-owner', expect.any(Object));
    expect(delivery.deliver).toHaveBeenCalledWith('a-1', 'fcm-worker-1', expect.any(Object));
    expect(delivery.deliver).toHaveBeenCalledWith('a-1', 'fcm-worker-2', expect.any(Object));
  });

  it('drives RAISED→SENT after dispatch attempts, regardless of delivery outcome', async () => {
    const { handler, alerts, delivery } = setup({ userIds: [] });
    delivery.deliver.mockResolvedValue(false);
    await handler.handle(event);
    expect(alerts.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-1', state: 'SENT' }));
  });

  it('does not attempt a transition when the alert has already moved past RAISED', async () => {
    const { handler, alerts } = setup({
      userIds: [],
      existingAlert: alert({ state: 'ACKNOWLEDGED', acknowledgedAt: new Date() }),
    });
    await handler.handle(event);
    expect(alerts.save).not.toHaveBeenCalled();
  });

  it('a recipient with no registered device produces no dispatch but still dispatches to others', async () => {
    const { handler, delivery } = setup({
      userIds: ['owner-1', 'no-device-user'],
      devicesByUser: { 'owner-1': [device('owner-1', 'fcm-owner')] },
    });
    await handler.handle(event);
    expect(delivery.deliver).toHaveBeenCalledTimes(1);
  });
});
