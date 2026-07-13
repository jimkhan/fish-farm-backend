import { IsDateString, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

/** `CreateMortality` schema (contracts/openapi.yaml, CON-019). */
export class CreateMortalityDto {
  @IsInt()
  @IsPositive()
  count!: number;

  @IsString()
  causeCategory!: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsDateString()
  occurredAt!: string;

  @IsString()
  clientMutationId!: string;
}
