import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DeliveryAttempt } from '../domain/delivery-attempt.entity';
import {
  DeliveryResult,
  FALLBACK_NOTIFICATION_CHANNEL,
  NOTIFICATION_CHANNEL,
  NotificationChannel,
  NotificationPayload,
} from '../domain/notification-channel.port';
import {
  DELIVERY_ATTEMPT_REPOSITORY,
  DeliveryAttemptRepositoryPort,
} from './ports/delivery-attempt-repository.port';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * F3 (TASK-017, AC-052, R6): retries the primary channel (FCM) up to `MAX_PRIMARY_ATTEMPTS` times
 * with backoff, then falls back to the secondary channel (SMS — inactive in MVP per BACKLOG's own
 * non-goal, "No SMS fallback until Phase 2," but the fallback *call* is real and exercises the
 * extension seam TASK-016's `NotificationChannel` port promised: "enabling them later requires no
 * change to the alert engine"). Every attempt on every channel is recorded as a `delivery_attempt`
 * row — nothing is silently dropped (R6), even when every channel fails. Backoff/attempt-count
 * are a documented, tunable judgment call — the module doc names no exact numbers.
 */
@Injectable()
export class DeliveryService {
  private static readonly MAX_PRIMARY_ATTEMPTS = 3;
  private static readonly BACKOFF_MS = [50, 150];

  constructor(
    @Inject(NOTIFICATION_CHANNEL) private readonly primary: NotificationChannel,
    @Inject(FALLBACK_NOTIFICATION_CHANNEL) private readonly fallback: NotificationChannel,
    @Inject(DELIVERY_ATTEMPT_REPOSITORY) private readonly attempts: DeliveryAttemptRepositoryPort,
  ) {}

  /** Whether the alert ultimately reached this target on any channel. */
  async deliver(alertId: string, target: string, payload: NotificationPayload): Promise<boolean> {
    for (let attempt = 1; attempt <= DeliveryService.MAX_PRIMARY_ATTEMPTS; attempt += 1) {
      const result = await this.primary.send(target, payload);
      await this.record(alertId, this.primary.name, result);
      if (result.success) {
        return true;
      }
      if (attempt < DeliveryService.MAX_PRIMARY_ATTEMPTS) {
        await sleep(DeliveryService.BACKOFF_MS[attempt - 1] ?? 0);
      }
    }

    const fallbackResult = await this.fallback.send(target, payload);
    await this.record(alertId, this.fallback.name, fallbackResult);
    return fallbackResult.success;
  }

  private async record(
    alertId: string,
    channel: NotificationChannel['name'],
    result: DeliveryResult,
  ): Promise<void> {
    await this.attempts.save(
      DeliveryAttempt.reconstitute({
        id: randomUUID(),
        alertId,
        channel,
        status: result.success ? 'SENT' : 'FAILED',
        attemptedAt: new Date(),
        error: result.error ?? null,
      }),
    );
  }
}
