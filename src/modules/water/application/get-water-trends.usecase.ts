import { Inject, Injectable } from '@nestjs/common';
import { FallingDawnDoAdvisory, PatternDetector } from '../domain/pattern-detector';
import { WaterParameter, WaterReading } from '../domain/water-reading.entity';
import {
  WATER_READING_REPOSITORY,
  WaterReadingRepositoryPort,
} from './ports/water-reading-repository.port';

export interface WaterTrends {
  readonly parameter: WaterParameter;
  /** The window's readings for `parameter`, ascending by `readAt` (chart-ready time series). */
  readonly series: WaterReading[];
  /** Non-null only for `DO` when the falling-dawn-DO pattern is currently active (AC-087). */
  readonly advisory: FallingDawnDoAdvisory | null;
}

/**
 * `GET /projects/{projectId}/ponds/{pondId}/water-readings/trends` (CON-059, FT-034/F3, AC-087).
 * The backend data half of "water trend charts"; the chart UI itself is TASK-039 (web). Returns
 * the parameter's series over the window plus — for DO — a falling-dawn-DO early-warning advisory
 * that is a *pattern* signal, distinct from the instantaneous `WaterThresholdBreached` that
 * `RecordReadingUseCase` already emits. Any member role (read-only, like the readings list).
 */
@Injectable()
export class GetWaterTrendsUseCase {
  private readonly patternDetector = new PatternDetector();

  constructor(
    @Inject(WATER_READING_REPOSITORY) private readonly readings: WaterReadingRepositoryPort,
  ) {}

  async execute(
    pondId: string,
    parameter: WaterParameter,
    fromInclusive: Date,
    toExclusive: Date,
  ): Promise<WaterTrends> {
    const window = await this.readings.findForPondBetween(
      pondId,
      parameter,
      fromInclusive,
      toExclusive,
    );
    const series = [...window].sort((a, b) => a.readAt.getTime() - b.readAt.getTime());

    // The pattern is DO-specific ("falling dawn DO"); other parameters get the series only.
    const advisory =
      parameter === 'DO'
        ? this.patternDetector.detectFallingDawnDo(
            series.map((reading) => ({ value: reading.value, readAt: reading.readAt })),
          )
        : null;

    return { parameter, series, advisory };
  }
}
