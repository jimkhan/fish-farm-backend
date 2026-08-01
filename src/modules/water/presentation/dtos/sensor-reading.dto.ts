import { IsDateString, IsIn, IsNumber } from 'class-validator';
import { WaterParameter } from '../../domain/water-reading.entity';

const WATER_PARAMETERS: WaterParameter[] = [
  'DO',
  'TEMP',
  'PH',
  'AMMONIA',
  'NITRITE',
  'ALKALINITY',
  'SECCHI',
];

/**
 * `SensorReading` schema (contracts/openapi.yaml, CON-044). No `pondId`/`projectId`/`source`/
 * `clientMutationId` — all are derived server-side from the authenticated device row (never
 * client-supplied), and the global `ValidationPipe`'s `forbidNonWhitelisted` rejects any extra
 * field with 400.
 */
export class SensorReadingDto {
  @IsIn(WATER_PARAMETERS)
  parameter!: WaterParameter;

  @IsNumber()
  value!: number;

  @IsDateString()
  readAt!: string;
}
