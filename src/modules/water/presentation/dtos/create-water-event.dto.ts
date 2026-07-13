import { IsOptional, IsString, IsUUID } from 'class-validator';

/** `CreateWaterEvent` schema (contracts/openapi.yaml, CON-028) — every field optional, matching
 * "independent of any reading" (module doc F5, edge case 3). */
export class CreateWaterEventDto {
  @IsOptional()
  @IsUUID()
  pondId?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  clientMutationId?: string;
}
