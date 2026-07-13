import { IsDateString, IsInt, IsString, Min } from 'class-validator';

/** `CreateTreatment` schema (contracts/openapi.yaml, CON-051). */
export class CreateTreatmentDto {
  @IsString()
  product!: string;

  @IsString()
  dose!: string;

  @IsDateString()
  administeredOn!: string;

  @IsInt()
  @Min(0)
  withdrawalDays!: number;
}
