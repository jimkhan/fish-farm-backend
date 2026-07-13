import { DeviceToken } from '../domain/device-token.entity';
import { RegisterDeviceUseCase } from './register-device.usecase';
import { DeviceTokenRepositoryPort } from './ports/device-token-repository.port';

function setup(overrides: { existing?: DeviceToken | null } = {}) {
  const devices: jest.Mocked<DeviceTokenRepositoryPort> = {
    findByUserId: jest.fn(),
    findByFcmToken: jest
      .fn()
      .mockResolvedValue(overrides.existing === undefined ? null : overrides.existing),
    save: jest.fn().mockImplementation(async (t: DeviceToken) => t),
  };
  const useCase = new RegisterDeviceUseCase(devices);
  return { useCase, devices };
}

describe('RegisterDeviceUseCase (TASK-016, CON-045, AC-053)', () => {
  it('registers a new device token for the user', async () => {
    const { useCase, devices } = setup();
    const token = await useCase.execute('u-1', { fcmToken: 'fcm-abc', platform: 'ANDROID' });
    expect(token.userId).toBe('u-1');
    expect(token.fcmToken).toBe('fcm-abc');
    expect(devices.save).toHaveBeenCalledTimes(1);
  });

  it('re-registering an existing fcmToken upserts in place (same id, new owner/platform)', async () => {
    const existing = DeviceToken.reconstitute({
      id: 'd-1',
      userId: 'u-old',
      fcmToken: 'fcm-shared',
      platform: 'WEB',
      registeredAt: new Date('2026-01-01'),
    });
    const { useCase } = setup({ existing });
    const token = await useCase.execute('u-new', { fcmToken: 'fcm-shared', platform: 'ANDROID' });
    expect(token.id).toBe('d-1');
    expect(token.userId).toBe('u-new');
    expect(token.platform).toBe('ANDROID');
  });
});
