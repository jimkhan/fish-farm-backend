import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_WATER_THRESHOLDS } from '../domain/default-thresholds';
import { WaterParameter } from '../domain/water-reading.entity';
import {
  WATER_THRESHOLD_REPOSITORY,
  WaterThresholdRepositoryPort,
} from './ports/water-threshold-repository.port';

const ALL_PARAMETERS: readonly WaterParameter[] = [
  'DO',
  'TEMP',
  'PH',
  'AMMONIA',
  'NITRITE',
  'ALKALINITY',
  'SECCHI',
];

export interface EffectiveThreshold {
  readonly parameter: WaterParameter;
  readonly min: number | null;
  readonly max: number | null;
  readonly critical: number | null;
}

/**
 * `GET /projects/{projectId}/water-thresholds` (CON-027a, AC-085). Returns all 7 parameters —
 * a project's explicit override where configured, the seeded default otherwise ("configured...
 * or seeded defaults are used"). The wire `WaterThreshold` schema itself carries no `id`
 * (contracts/openapi.yaml), so a plain value shape is returned here rather than the persisted
 * `WaterThreshold` domain entity — a seeded default was never actually stored.
 */
@Injectable()
export class GetThresholdsUseCase {
  constructor(
    @Inject(WATER_THRESHOLD_REPOSITORY) private readonly thresholds: WaterThresholdRepositoryPort,
  ) {}

  async execute(): Promise<EffectiveThreshold[]> {
    const configured = await this.thresholds.findAllInCurrentProject();
    const byParameter = new Map(configured.map((t) => [t.parameter, t]));

    return ALL_PARAMETERS.map((parameter) => {
      const existing = byParameter.get(parameter);
      const bounds = existing ?? DEFAULT_WATER_THRESHOLDS[parameter];
      return { parameter, min: bounds.min, max: bounds.max, critical: bounds.critical };
    });
  }
}
