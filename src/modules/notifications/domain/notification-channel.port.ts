export type DeliveryChannel = 'FCM' | 'SMS' | 'WHATSAPP';

export interface NotificationPayload {
  readonly title: string;
  readonly body: string;
  readonly data?: Record<string, string>;
}

export interface DeliveryResult {
  readonly success: boolean;
  readonly error?: string;
}

/**
 * F2/R6 (AC-057): the extension seam for every delivery channel. FCM is the only *active*
 * implementation in MVP (`FcmAdapter`, infrastructure); `SmsAdapter`/`WhatsAppAdapter` implement
 * this same port but always report `CHANNEL_UNAVAILABLE` (Phase 2 stubs) — enabling them later is
 * purely additive, no change to the alert engine or dispatch handler.
 */
export interface NotificationChannel {
  readonly name: DeliveryChannel;
  send(target: string, payload: NotificationPayload): Promise<DeliveryResult>;
}

export const NOTIFICATION_CHANNEL = 'NotificationChannel';
/**
 * TASK-017/R6: the channel `DeliveryService` falls back to once the primary (FCM) exhausts its
 * retries. Bound to `SmsAdapter` (still inactive per BACKLOG's "No SMS fallback until Phase 2" —
 * the *call* is real, the *channel* isn't yet), so a fallback attempt is genuinely made and
 * recorded, never skipped, even though it currently always reports `CHANNEL_UNAVAILABLE`.
 */
export const FALLBACK_NOTIFICATION_CHANNEL = 'FallbackNotificationChannel';
