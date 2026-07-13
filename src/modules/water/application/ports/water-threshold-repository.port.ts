import { WaterThreshold } from '../../domain/water-threshold.entity';
import { WaterParameter } from '../../domain/water-reading.entity';

/** Tenant-scoped (ADR-006). */
export interface WaterThresholdRepositoryPort {
  findAllInCurrentProject(): Promise<WaterThreshold[]>;
  findByParameter(parameter: WaterParameter): Promise<WaterThreshold | null>;
  save(threshold: WaterThreshold): Promise<WaterThreshold>;
}

export const WATER_THRESHOLD_REPOSITORY = 'WaterThresholdRepositoryPort';
