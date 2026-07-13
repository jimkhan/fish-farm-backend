import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { LandUnit } from '../../domain/project.entity';
import { CreateFirstPondDto } from './create-first-pond.dto';

/**
 * `CreateProject` schema (contracts/openapi.yaml, CON-007) — minus `currency`, which is never a
 * user choice (ADR-018) so the server doesn't read it even if a client sends one — the global
 * `ValidationPipe`'s `forbidNonWhitelisted` rejects it with a clear 400 instead of silently
 * dropping it.
 */
export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  siteLat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  siteLng!: number;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsIn(['DECIMAL', 'KATHA', 'BIGHA'])
  landUnit?: LandUnit;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateFirstPondDto)
  firstPond?: CreateFirstPondDto;
}
