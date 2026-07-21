import { Inject, Injectable } from '@nestjs/common';
import { FEEDING_LOG_REPOSITORY, FeedingLogRepositoryPort } from '../../feed/application/ports/feeding-log-repository.port';
import { MORTALITY_REPOSITORY, MortalityRepositoryPort } from '../../health/application/ports/mortality-repository.port';
import { TASK_LOG_REPOSITORY, TaskLogRepositoryPort } from '../../tasks/application/ports/task-log-repository.port';
import { TASK_REPOSITORY, TaskRepositoryPort } from '../../tasks/application/ports/task-repository.port';
import { DEFAULT_WATER_THRESHOLDS } from '../../water/domain/default-thresholds';
import { ThresholdBounds } from '../../water/domain/breach-evaluator';
import { WaterParameter } from '../../water/domain/water-reading.entity';
import {
  WATER_READING_REPOSITORY,
  WaterReadingRepositoryPort,
} from '../../water/application/ports/water-reading-repository.port';
import {
  WATER_THRESHOLD_REPOSITORY,
  WaterThresholdRepositoryPort,
} from '../../water/application/ports/water-threshold-repository.port';
import { utcDayRange } from '../domain/date-range';
import { DailyWaterStatus, reduceWaterStatus } from '../domain/water-status.service';

export interface DailySummaryResult {
  readonly date: Date;
  readonly feedUsedKg: number;
  readonly mortalities: number;
  readonly waterStatus: DailyWaterStatus;
  readonly tasksDone: number;
  readonly tasksMissed: number;
}

/**
 * `GET /projects/{projectId}/reports/daily-summary` (CON-042, F3, R5, AC-122/125). Composes
 * read-models from four sibling modules (feed, mortality, water, tasks) — reusing each module's
 * already-exported, already-tenant-scoped repository port directly, per the module doc's own
 * §4.5 instruction ("reads published read-models rather than importing domain internals") and
 * §4.3 ("no own operational tables" — purely a live query, never cached, unlike weather's
 * scheduler-refreshed snapshot). No port-inversion layer is needed here (unlike
 * `PortfolioSummaryUseCase`'s MOD-03↔MOD-04 inverted ports) — there is no cyclic-dependency
 * problem to solve, `ReportingModule` simply depends forward on Feed/Health/Water/Tasks.
 *
 * A day with no activity legitimately returns zeros/`OK` (R5/AC-125, edge case 7) — every
 * sub-aggregate already degrades to its own empty-input default rather than needing a special
 * "no activity" branch here.
 *
 * **`tasksMissed` is a documented, real data-model limitation, not a fabricated precise number**:
 * `Task` has no historical log of *when* it transitioned to `MISSED` (only a mutable `status`
 * field, and `dueOn` advances forward on each recurrence) — so this counts tasks whose **current**
 * `dueOn` falls on the requested date and whose **current** `status` is `MISSED`. Accurate for
 * "today" and any task whose latest occurrence happens to be the requested date; undercounts an
 * older date for a since-recurred task. No historical-tracking infrastructure was invented to
 * close this gap — out of this task's stated scope (Estimate: 3, no new table implied anywhere).
 */
@Injectable()
export class GetDailySummaryUseCase {
  constructor(
    @Inject(FEEDING_LOG_REPOSITORY) private readonly feedingLogs: FeedingLogRepositoryPort,
    @Inject(MORTALITY_REPOSITORY) private readonly mortalities: MortalityRepositoryPort,
    @Inject(WATER_READING_REPOSITORY) private readonly waterReadings: WaterReadingRepositoryPort,
    @Inject(WATER_THRESHOLD_REPOSITORY) private readonly waterThresholds: WaterThresholdRepositoryPort,
    @Inject(TASK_LOG_REPOSITORY) private readonly taskLogs: TaskLogRepositoryPort,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepositoryPort,
  ) {}

  async execute(date: Date): Promise<DailySummaryResult> {
    const { fromInclusive, toExclusive } = utcDayRange(date);

    const [feedingLogsForDay, mortalitiesForDay, readingsForDay, configuredThresholds, taskLogsForDay, allTasks] =
      await Promise.all([
        this.feedingLogs.findForProjectBetween(fromInclusive, toExclusive),
        this.mortalities.findForProjectBetween(fromInclusive, toExclusive),
        this.waterReadings.findForProjectBetween(fromInclusive, toExclusive),
        this.waterThresholds.findAllInCurrentProject(),
        this.taskLogs.findForProjectBetween(fromInclusive, toExclusive),
        this.tasks.findAllInCurrentProject(),
      ]);

    const feedUsedKg = feedingLogsForDay.reduce((sum, log) => sum + log.qtyKg, 0);
    const mortalityCount = mortalitiesForDay.reduce((sum, mortality) => sum + mortality.count, 0);

    const thresholdsByParameter: Record<WaterParameter, ThresholdBounds> = { ...DEFAULT_WATER_THRESHOLDS };
    for (const threshold of configuredThresholds) {
      thresholdsByParameter[threshold.parameter] = {
        min: threshold.min,
        max: threshold.max,
        critical: threshold.critical,
      };
    }
    const waterStatus = reduceWaterStatus(readingsForDay, thresholdsByParameter);

    const tasksDone = taskLogsForDay.length;
    const tasksMissed = allTasks.filter(
      (task) => task.status === 'MISSED' && isSameUtcDay(task.dueOn, fromInclusive),
    ).length;

    return {
      date: fromInclusive,
      feedUsedKg,
      mortalities: mortalityCount,
      waterStatus,
      tasksDone,
      tasksMissed,
    };
  }
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
