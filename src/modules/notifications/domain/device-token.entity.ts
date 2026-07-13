export type DevicePlatform = 'ANDROID' | 'WEB';

/**
 * Pure domain `DeviceToken` (TASK-016, MOD-09 §4.3/F2, ERD `DEVICE_TOKEN`). User-owned, not
 * project-owned — a device belongs to a user across every project they're a member of (same
 * cross-project shape as `RefreshToken`/`PasswordResetToken`).
 */
export interface DeviceTokenProps {
  readonly id: string;
  readonly userId: string;
  readonly fcmToken: string;
  readonly platform: DevicePlatform | null;
  readonly registeredAt: Date;
}

export class DeviceToken {
  private constructor(private readonly props: DeviceTokenProps) {}

  static reconstitute(props: DeviceTokenProps): DeviceToken {
    return new DeviceToken(props);
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get fcmToken(): string {
    return this.props.fcmToken;
  }

  get platform(): DevicePlatform | null {
    return this.props.platform;
  }

  get registeredAt(): Date {
    return this.props.registeredAt;
  }
}
