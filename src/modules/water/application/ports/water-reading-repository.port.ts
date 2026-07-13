import { WaterReading } from '../../domain/water-reading.entity';

/** Tenant-scoped (ADR-006). */
export interface WaterReadingRepositoryPort {
  findForPond(pondId: string, parameter?: string): Promise<WaterReading[]>;
  findByClientMutationId(clientMutationId: string): Promise<WaterReading | null>;
  save(reading: WaterReading): Promise<WaterReading>;
}

export const WATER_READING_REPOSITORY = 'WaterReadingRepositoryPort';
