import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DeviceToken, DevicePlatform } from '../domain/device-token.entity';
import {
  DEVICE_TOKEN_REPOSITORY,
  DeviceTokenRepositoryPort,
} from './ports/device-token-repository.port';

export interface RegisterDeviceInput {
  readonly fcmToken: string;
  readonly platform?: DevicePlatform;
}

/**
 * `POST /notifications/devices` (CON-045, FT-051, AC-053). Own auth check, no `:projectId`
 * (same pattern as `/me`) — a device belongs to a user, not a project. Idempotent by
 * `fcmToken` (ERD `UK` — "re-registration upserts, no duplicate pushes"): re-registering the
 * same token (even by a different user, e.g. a shared/reset device) updates the existing row
 * rather than creating a duplicate.
 */
@Injectable()
export class RegisterDeviceUseCase {
  constructor(
    @Inject(DEVICE_TOKEN_REPOSITORY) private readonly devices: DeviceTokenRepositoryPort,
  ) {}

  async execute(userId: string, input: RegisterDeviceInput): Promise<DeviceToken> {
    const existing = await this.devices.findByFcmToken(input.fcmToken);

    const token = DeviceToken.reconstitute({
      id: existing?.id ?? randomUUID(),
      userId,
      fcmToken: input.fcmToken,
      platform: input.platform ?? null,
      registeredAt: new Date(),
    });

    return this.devices.save(token);
  }
}
