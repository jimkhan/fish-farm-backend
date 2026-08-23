import { FeedingLog } from '../../feed/domain/feeding-log.entity';
import { FeedingLogRepositoryPort } from '../../feed/application/ports/feeding-log-repository.port';
import { Mortality } from '../../health/domain/mortality.entity';
import { MortalityRepositoryPort } from '../../health/application/ports/mortality-repository.port';
import { Task } from '../../tasks/domain/task.entity';
import { TaskRepositoryPort } from '../../tasks/application/ports/task-repository.port';
import { TaskLog } from '../../tasks/domain/task-log.entity';
import { TaskLogRepositoryPort } from '../../tasks/application/ports/task-log-repository.port';
import { WaterReading } from '../../water/domain/water-reading.entity';
import { WaterReadingRepositoryPort } from '../../water/application/ports/water-reading-repository.port';
import { WaterThresholdRepositoryPort } from '../../water/application/ports/water-threshold-repository.port';
import { GetDailySummaryUseCase } from './get-daily-summary.usecase';

const THE_DATE = new Date('2026-06-15T09:00:00Z');

function feedingLog(qtyKg: number): FeedingLog {
  return FeedingLog.reconstitute({
    id: `f-${qtyKg}`,
    projectId: 'p-1',
    batchId: 'batch-1',
    inventoryItemId: 'item-1',
    qtyKg,
    observation: null,
    fedAt: THE_DATE,
    clientMutationId: `cm-${qtyKg}`,
    createdAt: THE_DATE,
  });
}

function mortality(count: number): Mortality {
  return Mortality.reconstitute({
    id: `m-${count}`,
    projectId: 'p-1',
    batchId: 'batch-1',
    count,
    causeCategory: 'DISEASE',
    photoUrl: null,
    occurredAt: THE_DATE,
    clientMutationId: `cm-m-${count}`,
    createdAt: THE_DATE,
  });
}

function reading(parameter: 'DO' | 'PH', value: number): WaterReading {
  return WaterReading.reconstitute({
    id: `w-${parameter}-${value}`,
    projectId: 'p-1',
    pondId: 'pond-1',
    parameter,
    value,
    source: 'MANUAL',
    deviceId: null,
    readAt: THE_DATE,
    clientMutationId: `cm-w-${parameter}-${value}`,
    createdAt: THE_DATE,
  });
}

function taskLog(): TaskLog {
  return TaskLog.reconstitute({
    id: 'tl-1',
    projectId: 'p-1',
    taskId: 'task-1',
    completedAt: THE_DATE,
    photoUrl: null,
    clientMutationId: 'cm-tl-1',
  });
}

function missedTask(dueOn: Date): Task {
  return Task.reconstitute({
    id: 'task-missed',
    projectId: 'p-1',
    pondId: null,
    title: 'Chain drag',
    recurrenceDays: null,
    status: 'MISSED',
    dueOn,
    assigneeUserId: null,
  });
}

function setup(
  overrides: {
    feedingLogs?: FeedingLog[];
    mortalities?: Mortality[];
    readings?: WaterReading[];
    taskLogs?: TaskLog[];
    tasks?: Task[];
  } = {},
) {
  const feedingLogs: jest.Mocked<FeedingLogRepositoryPort> = {
    findByClientMutationId: jest.fn(),
    findForProjectBetween: jest.fn().mockResolvedValue(overrides.feedingLogs ?? []),
    save: jest.fn(),
  };
  const mortalities: jest.Mocked<MortalityRepositoryPort> = {
    findByClientMutationId: jest.fn(),
    findForBatchBetween: jest.fn(),
    findForProjectBetween: jest.fn().mockResolvedValue(overrides.mortalities ?? []),
    save: jest.fn(),
  };
  const waterReadings: jest.Mocked<WaterReadingRepositoryPort> = {
    findForPond: jest.fn(),
    findForPondBetween: jest.fn().mockResolvedValue([]),
    findForProjectBetween: jest.fn().mockResolvedValue(overrides.readings ?? []),
    findByClientMutationId: jest.fn(),
    save: jest.fn(),
  };
  const waterThresholds: jest.Mocked<WaterThresholdRepositoryPort> = {
    findAllInCurrentProject: jest.fn().mockResolvedValue([]),
    findByParameter: jest.fn(),
    save: jest.fn(),
  };
  const taskLogs: jest.Mocked<TaskLogRepositoryPort> = {
    findByClientMutationId: jest.fn(),
    findForProjectBetween: jest.fn().mockResolvedValue(overrides.taskLogs ?? []),
    save: jest.fn(),
  };
  const tasks: jest.Mocked<TaskRepositoryPort> = {
    findAllInCurrentProject: jest.fn().mockResolvedValue(overrides.tasks ?? []),
    findById: jest.fn(),
    save: jest.fn(),
    deleteById: jest.fn(),
  };

  const useCase = new GetDailySummaryUseCase(
    feedingLogs,
    mortalities,
    waterReadings,
    waterThresholds,
    taskLogs,
    tasks,
  );
  return { useCase, feedingLogs, mortalities, waterReadings, waterThresholds, taskLogs, tasks };
}

describe('GetDailySummaryUseCase (TASK-037, CON-042, R5, AC-122/125)', () => {
  it('AC-122: composes feed used, mortalities, water status, and tasks done/missed for the date', async () => {
    const { useCase } = setup({
      feedingLogs: [feedingLog(10), feedingLog(5)],
      mortalities: [mortality(3), mortality(2)],
      readings: [reading('DO', 2.5)], // below critical=3 → CRITICAL
      taskLogs: [taskLog()],
      tasks: [missedTask(new Date('2026-06-15T00:00:00Z'))],
    });

    const result = await useCase.execute(THE_DATE);

    expect(result.feedUsedKg).toBe(15);
    expect(result.mortalities).toBe(5);
    expect(result.waterStatus).toBe('CRITICAL');
    expect(result.tasksDone).toBe(1);
    expect(result.tasksMissed).toBe(1);
  });

  it('AC-125: a day with no activity returns zeros/OK, never an error', async () => {
    const { useCase } = setup();
    const result = await useCase.execute(THE_DATE);
    expect(result).toEqual({
      date: new Date('2026-06-15T00:00:00.000Z'),
      feedUsedKg: 0,
      mortalities: 0,
      waterStatus: 'OK',
      tasksDone: 0,
      tasksMissed: 0,
    });
  });

  it('a missed task due on a different date does not count toward this date', async () => {
    const { useCase } = setup({
      tasks: [missedTask(new Date('2026-06-10T00:00:00Z'))],
    });
    const result = await useCase.execute(THE_DATE);
    expect(result.tasksMissed).toBe(0);
  });
});
