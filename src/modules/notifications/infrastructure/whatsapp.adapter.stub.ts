import { Injectable } from '@nestjs/common';
import { DeliveryResult, NotificationChannel } from '../domain/notification-channel.port';

/** AC-057: same shape as `SmsAdapter` — see its doc comment. */
@Injectable()
export class WhatsAppAdapter implements NotificationChannel {
  readonly name = 'WHATSAPP' as const;

  async send(): Promise<DeliveryResult> {
    return { success: false, error: 'CHANNEL_UNAVAILABLE: WhatsApp is not enabled in MVP.' };
  }
}
