import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  DEVICE_TOKEN_REPOSITORY,
  DeviceTokenRepositoryPort,
} from '../../notifications/application/ports/device-token-repository.port';
import { NOTIFICATION_CHANNEL, NotificationChannel } from '../../notifications/domain/notification-channel.port';
import {
  PROJECT_MEMBERS_DIRECTORY,
  ProjectMembersDirectoryPort,
} from '../../identity/application/ports/project-members-directory.port';
import {
  BATCH_EVENT_REPOSITORY,
  BatchEventRepositoryPort,
} from '../../ponds/application/ports/batch-event-repository.port';
import { SPECIES_REPOSITORY, SpeciesRepositoryPort } from '../../ponds/application/ports/species-repository.port';
import { FeedType } from '../../inventory/domain/inventory-item.entity';
import { feedTypeForSpeciesCategory } from '../domain/feed-type';

/**
 * F4 (TASK-021, AC-081, module doc §6.4 open question — "are feeding reminders authoritative on
 * the server (push) or on the mobile device (local, offline)?" resolved to "both": this is the
 * server-push half; mobile local reminders (MOD-12) are a client-side concern, not this task's).
 * Fires at two fixed times a day (`@Cron` matches an exact minute, so this naturally runs once per
 * slot with no separate "already reminded today" flag needed — the same kind of natural
 * coordination TASK-024 leaned on with `DomainEventBus.publish()`). One reminder per (project,
 * feed type) with at least one `ACTIVE` batch, delivered only to that project's `WORKER`
 * member(s) — module doc §2.3: the worker feeds, the owner/partner don't receive this. Delivered
 * directly through the primary `NotificationChannel`, not `DeliveryService` (TASK-017) — that
 * machinery exists to retry/escalate/audit a CRITICAL `Alert`'s delivery; a routine twice-daily
 * nudge is not an alert, has no acknowledgement lifecycle, and is never modeled as one (the
 * `AlertType` enum has no `FEEDING_REMINDER` member — inventing one would misuse the escalation
 * pipeline for a best-effort, non-actionable notice). `MORNING_CRON`/`EVENING_CRON` are a
 * documented default — the module doc names no exact times (same kind of tunable judgment call as
 * TASK-017's retry/backoff constants).
 */
@Injectable()
export class FeedingReminderScheduler {
  static readonly MORNING_CRON = '0 7 * * *';
  static readonly EVENING_CRON = '0 17 * * *';

  constructor(
    @Inject(BATCH_EVENT_REPOSITORY) private readonly batches: BatchEventRepositoryPort,
    @Inject(SPECIES_REPOSITORY) private readonly species: SpeciesRepositoryPort,
    @Inject(PROJECT_MEMBERS_DIRECTORY) private readonly members: ProjectMembersDirectoryPort,
    @Inject(DEVICE_TOKEN_REPOSITORY) private readonly devices: DeviceTokenRepositoryPort,
    @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel,
  ) {}

  @Cron(FeedingReminderScheduler.MORNING_CRON)
  async remindMorning(): Promise<void> {
    await this.remind();
  }

  @Cron(FeedingReminderScheduler.EVENING_CRON)
  async remindEvening(): Promise<void> {
    await this.remind();
  }

  async remind(): Promise<void> {
    const [activeBatches, allSpecies] = await Promise.all([
      this.batches.findAllActive(),
      this.species.findAll(),
    ]);
    const speciesById = new Map(allSpecies.map((s) => [s.id, s]));

    const due = new Map<string, { projectId: string; feedType: FeedType }>();
    for (const batch of activeBatches) {
      const speciesEntity = speciesById.get(batch.speciesId);
      if (!speciesEntity) {
        continue;
      }
      const feedType = feedTypeForSpeciesCategory(speciesEntity.category);
      due.set(`${batch.projectId}:${feedType}`, { projectId: batch.projectId, feedType });
    }

    for (const { projectId, feedType } of due.values()) {
      await this.notifyWorkers(projectId, feedType);
    }
  }

  private async notifyWorkers(projectId: string, feedType: FeedType): Promise<void> {
    const memberships = await this.members.findActiveByProjectId(projectId);
    const workerIds = memberships.filter((m) => m.role === 'WORKER').map((m) => m.userId);
    const tokensByWorker = await Promise.all(workerIds.map((userId) => this.devices.findByUserId(userId)));

    for (const token of tokensByWorker.flat()) {
      await this.channel.send(token.fcmToken, {
        title: 'Feeding reminder',
        body: `It's time to feed your ${feedType.toLowerCase()} batches.`,
        data: { projectId, feedType },
      });
    }
  }
}
