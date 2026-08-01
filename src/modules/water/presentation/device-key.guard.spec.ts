import { createHash } from 'node:crypto';
import { ExecutionContext } from '@nestjs/common';
import { UnauthenticatedError } from '../../../shared-kernel/errors/domain-error';
import { Device } from '../domain/device.entity';
import { DeviceRepositoryPort } from '../application/ports/device-repository.port';
import { DeviceAuthedRequest, DeviceKeyGuard } from './device-key.guard';

const RAW_KEY = 'a'.repeat(64);
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex');

function makeDevice(overrides: Partial<Device> = {}): Device {
  return Device.reconstitute({
    id: 'device-A',
    projectId: 'project-A',
    pondId: 'pond-A',
    deviceKeyHash: KEY_HASH,
    label: 'Pond A DO sensor',
    registeredAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });
}

function contextFor(request: DeviceAuthedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('DeviceKeyGuard (CON-044, AC-089, R6)', () => {
  let devices: jest.Mocked<DeviceRepositoryPort>;
  let guard: DeviceKeyGuard;

  beforeEach(() => {
    devices = { findById: jest.fn(), save: jest.fn() };
    guard = new DeviceKeyGuard(devices);
  });

  it('authenticates a valid key and sets tenant scope + device from the device row', async () => {
    devices.findById.mockResolvedValue(makeDevice());
    const request: DeviceAuthedRequest = {
      headers: { 'x-device-key': RAW_KEY },
      params: { deviceId: 'device-A' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(devices.findById).toHaveBeenCalledWith('device-A');
    expect(request.tenant).toEqual({ projectId: 'project-A', userId: 'device-A', role: 'WORKER' });
    expect(request.device).toEqual({ id: 'device-A', pondId: 'pond-A' });
  });

  it('rejects a missing device key with 401 and no scope', async () => {
    const request: DeviceAuthedRequest = { headers: {}, params: { deviceId: 'device-A' } };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(request.tenant).toBeUndefined();
  });

  it('rejects an unknown device with 401', async () => {
    devices.findById.mockResolvedValue(null);
    const request: DeviceAuthedRequest = {
      headers: { 'x-device-key': RAW_KEY },
      params: { deviceId: 'device-unknown' },
    };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rejects a key that does not match the addressed device (cross-device/project) with 401', async () => {
    // The URL names device-A, but the presented key belongs to a different device.
    devices.findById.mockResolvedValue(makeDevice());
    const request: DeviceAuthedRequest = {
      headers: { 'x-device-key': 'b'.repeat(64) },
      params: { deviceId: 'device-A' },
    };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(request.tenant).toBeUndefined();
  });
});
