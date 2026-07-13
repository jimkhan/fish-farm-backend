import { FcmAdapter } from './fcm.adapter';

describe('FcmAdapter (TASK-016, F2, AC-053)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports CHANNEL_UNAVAILABLE when no server key is configured, without calling fetch', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const adapter = new FcmAdapter(undefined);

    const result = await adapter.send('device-token', { title: 't', body: 'b' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/CHANNEL_UNAVAILABLE/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends a high-priority FCM request with the configured server key', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    const adapter = new FcmAdapter('test-server-key');

    const result = await adapter.send('device-token', {
      title: 'WATER_EMERGENCY',
      body: 'Emergency',
      data: { alertId: 'a-1' },
    });

    expect(result.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://fcm.googleapis.com/fcm/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'key=test-server-key' }),
      }),
    );
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.to).toBe('device-token');
    expect(body.priority).toBe('high');
  });

  it('reports failure when FCM responds with a non-OK status', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401 } as Response);
    const adapter = new FcmAdapter('test-server-key');

    const result = await adapter.send('device-token', { title: 't', body: 'b' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/401/);
  });

  it('reports failure when the network call throws', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const adapter = new FcmAdapter('test-server-key');

    const result = await adapter.send('device-token', { title: 't', body: 'b' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('network down');
  });
});
