import { DeliveryChannel } from './notification-channel.port';

export type DeliveryStatus = 'SENT' | 'FAILED';

/**
 * Pure domain `DeliveryAttempt` (TASK-016, MOD-09 §4.3/F3, a documented ERD gap this task adds —
 * the module doc's own §4.3 lists this table but it was never in ERD.md; synced back). One row
 * per (alert, channel, device) dispatch attempt — R6's audit trail for "never silently dropped."
 */
export interface DeliveryAttemptProps {
  readonly id: string;
  readonly alertId: string;
  readonly channel: DeliveryChannel;
  readonly status: DeliveryStatus;
  readonly attemptedAt: Date;
  readonly error: string | null;
}

export class DeliveryAttempt {
  private constructor(private readonly props: DeliveryAttemptProps) {}

  static reconstitute(props: DeliveryAttemptProps): DeliveryAttempt {
    return new DeliveryAttempt(props);
  }

  get id(): string {
    return this.props.id;
  }

  get alertId(): string {
    return this.props.alertId;
  }

  get channel(): DeliveryChannel {
    return this.props.channel;
  }

  get status(): DeliveryStatus {
    return this.props.status;
  }

  get attemptedAt(): Date {
    return this.props.attemptedAt;
  }

  get error(): string | null {
    return this.props.error;
  }
}
