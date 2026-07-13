import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

/**
 * The `firstPond` shape from `CreateProject` (contracts/openapi.yaml `CreatePond`, TASK-018,
 * AC-032). Defined locally rather than importing MOD-04's `CreatePondDto` — MOD-03 must stay
 * acyclic (MOD-04 depends on MOD-03, not the reverse), so this is a deliberate small duplication
 * of the same four fields, not a shared import.
 */
export class CreateFirstPondDto {
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
