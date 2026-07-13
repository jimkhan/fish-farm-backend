import { IsIn, IsNumber, IsOptional } from 'class-validator';
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

/** `WaterThreshold` schema (contracts/openapi.yaml, CON-027/027a) used as both the PUT body's
 * array item and the response shape. */
export class WaterThresholdDto {
  @IsIn(WATER_PARAMETERS)
  parameter!: WaterParameter;

  @IsOptional()
  @IsNumber()
  min?: number | null;

  @IsOptional()
  @IsNumber()
  max?: number | null;

  @IsOptional()
  @IsNumber()
  critical?: number | null;
}
