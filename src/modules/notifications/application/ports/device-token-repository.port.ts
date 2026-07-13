import { DeviceToken } from '../../domain/device-token.entity';

/**
 * Unscoped by project (user-owned, not project-owned — see `DeviceToken`'s doc comment). Used
 * both inside an HTTP request (`RegisterDeviceUseCase`) and on `DomainEventBus` delivery
 * (`OnAlertRaisedHandler`, no `TenantContext` there) — the same shape either way since there is
 * never a project scope to filter through.
 */
export interface DeviceTokenRepositoryPort {
  findByUserId(userId: string): Promise<DeviceToken[]>;
  /** ERD `fcm_token UK` — re-registration upserts, never duplicates (edge case: same device, new user). */
  findByFcmToken(fcmToken: string): Promise<DeviceToken | null>;
  save(token: DeviceToken): Promise<DeviceToken>;
}

export const DEVICE_TOKEN_REPOSITORY = 'DeviceTokenRepositoryPort';
