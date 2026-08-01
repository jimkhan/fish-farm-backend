import { createHash } from 'node:crypto';
import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { UnauthenticatedError } from '../../../shared-kernel/errors/domain-error';
import { TenantState } from '../../../shared-kernel/tenant/tenant-context';
import { DEVICE_REPOSITORY, DeviceRepositoryPort } from '../application/ports/device-repository.port';

/** The request slice this guard reads and populates — structural, no `@types/express` needed. */
export interface DeviceAuthedRequest {
  headers: Record<string, string | string[] | undefined>;
  params: { deviceId?: string };
  tenant?: TenantState;
  /** The resolved device, for the controller to read (`pondId`/`id` feed the reading). */
  device?: { id: string; pondId: string };
}

/**
 * `DeviceKeyGuard` (TASK-027, MOD-06 F6, AC-089, R6). Authenticates a sensor by the `X-Device-Key`
 * header against the device identified by the `:deviceId` URL param, then establishes tenant scope
 * from the **device's own project** — never from the URL or payload. This is the auth guardrail:
 *
 * - No/blank key, unknown device, or a key that doesn't match that device's stored digest → 401
 *   (uniform "Invalid device credentials", no disclosure of which condition failed — so presenting
 *   device A's valid key against device B's URL is rejected exactly like a bad key).
 * - On success, `request.tenant.projectId` is set to the device's project (mirroring how the sync
 *   `MutationDispatcher` sets `request.tenant`). The scoped `WaterReadingRepository` then stamps
 *   `project_id` from it, so a device can only ever write to its own project (structural R6).
 *
 * The device is not a project member, so `userId`/`role` in the tenant state are synthetic (a
 * sensor performs operational writes — `WORKER`); only `projectId` is consumed on this path (no
 * `RolesGuard` runs here, and the audit actor is `request.user`, which stays unset for a device).
 */
@Injectable()
export class DeviceKeyGuard implements CanActivate {
  constructor(@Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepositoryPort) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DeviceAuthedRequest>();

    const rawKeyHeader = request.headers['x-device-key'];
    const rawKey = Array.isArray(rawKeyHeader) ? rawKeyHeader[0] : rawKeyHeader;
    const deviceId = request.params.deviceId;
    if (!rawKey || !deviceId) {
      throw new UnauthenticatedError('Invalid device credentials.');
    }

    const device = await this.devices.findById(deviceId);
    const presentedHash = createHash('sha256').update(rawKey).digest('hex');
    // Constant-ish comparison isn't required (the stored value is a public-length SHA-256 digest,
    // and lookup is by the caller-supplied id); a plain equality check on the digest is fine.
    if (!device || device.deviceKeyHash !== presentedHash) {
      throw new UnauthenticatedError('Invalid device credentials.');
    }

    request.tenant = { projectId: device.projectId, userId: device.id, role: 'WORKER' };
    request.device = { id: device.id, pondId: device.pondId };
    return true;
  }
}
