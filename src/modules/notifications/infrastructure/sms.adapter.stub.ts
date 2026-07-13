import { Injectable } from '@nestjs/common';
import { DeliveryResult, NotificationChannel } from '../domain/notification-channel.port';

/**
 * AC-057: implements `NotificationChannel` but is inactive in MVP (BACKLOG non-goal — "No SMS/
 * WhatsApp delivery in MVP"). Enabling it later (Phase 2) means swapping this for a real adapter
 * behind the same port — no change to the alert engine or dispatch handler.
 */
@Injectable()
export class SmsAdapter implements NotificationChannel {
  readonly name = 'SMS' as const;

  async send(): Promise<DeliveryResult> {
    return { success: false, error: 'CHANNEL_UNAVAILABLE: SMS is not enabled in MVP.' };
  }
}
