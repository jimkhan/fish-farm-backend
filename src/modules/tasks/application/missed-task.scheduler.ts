import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MissedTask } from '@fish-farm/shared';
import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { TASK_EVENT_REPOSITORY, TaskEventRepositoryPort } from './ports/task-event-repository.port';

/**
 * F5/R10 (TASK-041, AC-135): scans every project's tasks whose due date has arrived, promotes
 * `SCHEDULED→DUE` in place (housekeeping — `ListTasksUseCase` already recomputes at read time,
 * so this isn't required for correctness there, only for tasks nobody reads before they go
 * overdue), and transitions `DUE→MISSED` exactly once per task, emitting `MissedTask` (→ MOD-09)
 * only for a task that just became `MISSED` this scan — never re-emitting for one already
 * `MISSED` from a prior run (idempotent by persisted state, not an event-id set).
 */
@Injectable()
export class MissedTaskScheduler {
  constructor(
    @Inject(TASK_EVENT_REPOSITORY) private readonly tasks: TaskEventRepositoryPort,
    private readonly events: DomainEventBus,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async scan(): Promise<void> {
    const now = new Date();
    const candidates = await this.tasks.findDueOrOverdue(now);

    for (const task of candidates) {
      const recomputed = task.recomputeStatus(now);
      if (recomputed.status === task.status) {
        continue;
      }
      await this.tasks.save(recomputed);

      if (recomputed.status === 'MISSED') {
        const event: MissedTask = {
          name: 'MissedTask',
          eventId: randomUUID(),
          occurredAt: new Date(),
          projectId: recomputed.projectId,
          sourceRef: recomputed.id,
          message: `Task "${recomputed.title}" was not completed by its due date.`,
        };
        await this.events.publish(event);
      }
    }
  }
}
