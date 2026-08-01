import { Device } from '../../domain/device.entity';

/**
 * **Unscoped** (unlike `WaterReadingRepositoryPort`). Device authentication happens *before* any
 * tenant scope exists — the device is not a project member, and its project is derived from the
 * device row itself — so this lookup must not go through `ScopedRepository`/`TenantContext` (the
 * same reason `RefreshToken`'s repo is a plain, unscoped `Repository`).
 */
export interface DeviceRepositoryPort {
  /** Resolve a device by its id (the `deviceId` in the ingestion URL). */
  findById(id: string): Promise<Device | null>;
  save(device: Device): Promise<Device>;
}

export const DEVICE_REPOSITORY = 'DeviceRepositoryPort';
