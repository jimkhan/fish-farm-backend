import { Inject, Injectable } from '@nestjs/common';
import { WaterReading, WaterParameter } from '../domain/water-reading.entity';
import {
  WATER_READING_REPOSITORY,
  WaterReadingRepositoryPort,
} from './ports/water-reading-repository.port';

/** `GET /projects/{projectId}/ponds/{pondId}/water-readings` (CON-025, AC-090). Any member role. */
@Injectable()
export class ListReadingsUseCase {
  constructor(
    @Inject(WATER_READING_REPOSITORY) private readonly readings: WaterReadingRepositoryPort,
  ) {}

  async execute(pondId: string, parameter?: WaterParameter): Promise<WaterReading[]> {
    return this.readings.findForPond(pondId, parameter);
  }
}
