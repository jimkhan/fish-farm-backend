import { IsDateString, IsInt, IsNumber, IsPositive, IsString } from 'class-validator';

/** `CreateSampling` schema (contracts/openapi.yaml, CON-020). */
export class CreateSamplingDto {
  @IsInt()
  @IsPositive()
  sampleSize!: number;

  @IsNumber()
  @IsPositive()
  avgWeightG!: number;

  @IsDateString()
  sampledOn!: string;

  @IsString()
  clientMutationId!: string;
}
