import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

/** `CreatePond` schema (contracts/openapi.yaml, CON-014). */
export class CreatePondDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @IsPositive()
  area!: number;

  @IsOptional()
  @IsNumber()
  depthM?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
