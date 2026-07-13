import { Injectable } from '@nestjs/common';
import {
  DeliveryResult,
  NotificationChannel,
  NotificationPayload,
} from '../domain/notification-channel.port';

/**
 * F2 (TASK-016, AC-053): the active MVP channel. Credentials via env only (R9/NFR-005) — no
 * default, no hardcoded key. Legacy FCM HTTP API (`Authorization: key=<server key>`), matching
 * the backlog's own "FCM key via env" (a single key, not a full OAuth2 service-account JSON that
 * the newer HTTP v1 API would require) — a known future upgrade path if Google fully retires the
 * legacy endpoint. When no key is configured, `send()` reports `CHANNEL_UNAVAILABLE` rather than
 * throwing — same graceful-degradation shape as the SMS/WhatsApp stubs.
 */
@Injectable()
export class FcmAdapter implements NotificationChannel {
  readonly name = 'FCM' as const;

  constructor(private readonly serverKey: string | undefined) {}

  async send(target: string, payload: NotificationPayload): Promise<DeliveryResult> {
    if (!this.serverKey) {
      return { success: false, error: 'CHANNEL_UNAVAILABLE: FCM_SERVER_KEY not configured.' };
    }

    try {
      const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${this.serverKey}`,
        },
        body: JSON.stringify({
          to: target,
          priority: 'high',
          notification: { title: payload.title, body: payload.body },
          data: payload.data ?? {},
        }),
      });
      if (!response.ok) {
        return { success: false, error: `FCM responded with status ${response.status}` };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown FCM error' };
    }
  }
}
