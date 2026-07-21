import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';
import { HarvestGrade } from '../../domain/harvest.entity';

/** Nested `Money` shape, minus `currency` — never a user choice (ADR-018), same pattern as `CreateStockingDto.stockingCost`. */
export class HarvestRevenueDto {
  @IsInt()
  @IsPositive()
  amountMinor!: number;
}

/** `CreateHarvest` schema (contracts/openapi.yaml, CON-021). `clientMutationId` is a documented
 * contract extension — see `Harvest` domain entity's own doc comment. */
export class CreateHarvestDto {
  @IsInt()
  @IsPositive()
  quantity!: number;

  @IsNumber()
  @IsPositive()
  totalWeightKg!: number;

  @IsIn(['EXPORT', 'LOCAL'])
  grade!: HarvestGrade;

  @IsDateString()
  harvestedOn!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => HarvestRevenueDto)
  revenue?: HarvestRevenueDto;

  @IsString()
  clientMutationId!: string;
}
