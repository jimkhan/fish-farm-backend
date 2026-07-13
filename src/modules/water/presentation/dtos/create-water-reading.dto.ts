import { IsDateString, IsIn, IsNumber, IsString } from 'class-validator';
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
 * `CreateWaterReading` schema (contracts/openapi.yaml, CON-026). `source` is deliberately omitted
 * — this endpoint always records `MANUAL` server-side (see `WaterReading`'s doc comment); the
 * global `ValidationPipe`'s `forbidNonWhitelisted` rejects a client-supplied `source` with 400
 * rather than silently honoring it (same pattern as `CreateProjectDto` omitting `currency`).
 */
export class CreateWaterReadingDto {
  @IsIn(WATER_PARAMETERS)
  parameter!: WaterParameter;

  @IsNumber()
  value!: number;

  @IsDateString()
  readAt!: string;

  @IsString()
  clientMutationId!: string;
}
