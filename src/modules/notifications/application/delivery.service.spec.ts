import { NotificationChannel } from '../domain/notification-channel.port';
import { DeliveryService } from './delivery.service';
import { DeliveryAttemptRepositoryPort } from './ports/delivery-attempt-repository.port';

function setup(overrides: {
  primaryResults?: Array<{ success: boolean; error?: string }>;
  fallbackResult?: { success: boolean; error?: string };
} = {}) {
  const primaryResults = overrides.primaryResults ?? [{ success: true }];
  let primaryCall = 0;
  const primary: jest.Mocked<NotificationChannel> = {
    name: 'FCM',
    send: jest.fn().mockImplementation(async () => {
      const result = primaryResults[Math.min(primaryCall, primaryResults.length - 1)];
      primaryCall += 1;
      return result;
    }),
  };
  const fallback: jest.Mocked<NotificationChannel> = {
    name: 'SMS',
    send: jest.fn().mockResolvedValue(overrides.fallbackResult ?? { success: false, error: 'CHANNEL_UNAVAILABLE' }),
  };
  const attempts: jest.Mocked<DeliveryAttemptRepositoryPort> = {
    save: jest.fn().mockImplementation(async (a) => a),
  };

  const service = new DeliveryService(primary, fallback, attempts);
  return { service, primary, fallback, attempts };
}

describe('DeliveryService (TASK-017, F3, AC-052, R6)', () => {
  it('AC-052: succeeds on the first attempt without retrying or falling back', async () => {
    const { service, primary, fallback, attempts } = setup({ primaryResults: [{ success: true }] });
    const result = await service.deliver('a-1', 'device-1', { title: 't', body: 'b' });
    expect(result).toBe(true);
    expect(primary.send).toHaveBeenCalledTimes(1);
    expect(fallback.send).not.toHaveBeenCalled();
    expect(attempts.save).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: 'a-1', channel: 'FCM', status: 'SENT' }),
    );
  });

  it('AC-052: retries the primary channel with backoff on failure, then succeeds', async () => {
    const { service, primary, fallback } = setup({
      primaryResults: [{ success: false, error: 'timeout' }, { success: false, error: 'timeout' }, { success: true }],
    });
    const result = await service.deliver('a-1', 'device-1', { title: 't', body: 'b' });
    expect(result).toBe(true);
    expect(primary.send).toHaveBeenCalledTimes(3);
    expect(fallback.send).not.toHaveBeenCalled();
  });

  it('R6: falls back to the secondary channel once primary retries are exhausted', async () => {
    const { service, primary, fallback, attempts } = setup({
      primaryResults: [{ success: false, error: 'down' }],
      fallbackResult: { success: false, error: 'CHANNEL_UNAVAILABLE' },
    });
    const result = await service.deliver('a-1', 'device-1', { title: 't', body: 'b' });
    expect(result).toBe(false);
    expect(primary.send).toHaveBeenCalledTimes(3); // MAX_PRIMARY_ATTEMPTS
    expect(fallback.send).toHaveBeenCalledTimes(1);
    expect(attempts.save).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'SMS', status: 'FAILED', error: 'CHANNEL_UNAVAILABLE' }),
    );
  });

  it('R6: never silently drops — records a delivery_attempt for every single try, including the fallback', async () => {
    const { service, attempts } = setup({
      primaryResults: [{ success: false, error: 'e1' }],
      fallbackResult: { success: false, error: 'e2' },
    });
    await service.deliver('a-1', 'device-1', { title: 't', body: 'b' });
    // 3 primary attempts + 1 fallback attempt = 4 total.
    expect(attempts.save).toHaveBeenCalledTimes(4);
  });

  it('a successful fallback delivery reports overall success', async () => {
    const { service } = setup({
      primaryResults: [{ success: false, error: 'down' }],
      fallbackResult: { success: true },
    });
    const result = await service.deliver('a-1', 'device-1', { title: 't', body: 'b' });
    expect(result).toBe(true);
  });
});
