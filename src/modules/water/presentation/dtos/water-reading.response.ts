import { WaterReading } from '../../domain/water-reading.entity';

/** Wire shape of the `WaterReading` schema (contracts/openapi.yaml, CON-025/026). */
export interface WaterReadingResponse {
  id: string;
  projectId: string;
  pondId: string;
  parameter: string;
  value: number;
  source: string;
  deviceId: string | null;
  readAt: string;
}

export function toWaterReadingResponse(reading: WaterReading): WaterReadingResponse {
  return {
    id: reading.id,
    projectId: reading.projectId,
    pondId: reading.pondId,
    parameter: reading.parameter,
    value: reading.value,
    source: reading.source,
    deviceId: reading.deviceId,
    readAt: reading.readAt.toISOString(),
  };
}
