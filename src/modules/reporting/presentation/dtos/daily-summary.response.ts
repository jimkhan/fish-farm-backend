import { DailySummaryResult } from '../../application/get-daily-summary.usecase';

/** Wire shape of `GET .../reports/daily-summary` (CON-042, AC-122/125). */
export interface DailySummaryResponse {
  date: string;
  feedUsedKg: number;
  mortalities: number;
  waterStatus: 'OK' | 'WARNING' | 'CRITICAL';
  tasksDone: number;
  tasksMissed: number;
}

export function toDailySummaryResponse(result: DailySummaryResult): DailySummaryResponse {
  return {
    date: result.date.toISOString().slice(0, 10),
    feedUsedKg: result.feedUsedKg,
    mortalities: result.mortalities,
    waterStatus: result.waterStatus,
    tasksDone: result.tasksDone,
    tasksMissed: result.tasksMissed,
  };
}
