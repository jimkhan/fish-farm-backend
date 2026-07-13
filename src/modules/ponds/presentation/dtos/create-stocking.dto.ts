import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { StockingSource } from '../../domain/stocking.entity';

/**
 * Nested `Money` shape, minus `currency` — never a user choice (ADR-018), same pattern as
 * `CreateProjectDto` omitting the top-level `currency` field.
 */
export class StockingCostDto {
  @IsInt()
  @IsPositive()
  amountMinor!: number;
}

/** `CreateStocking` schema (contracts/openapi.yaml, CON-015). */
export class CreateStockingDto {
  @IsUUID()
  speciesId!: string;

  @IsOptional()
  @IsIn(['HATCHERY', 'WILD', 'OTHER'])
  source?: StockingSource;

  @IsOptional()
  @IsString()
  hatcheryName?: string;

  @IsInt()
  @IsPositive()
  count!: number;

  @IsDateString()
  stockedOn!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => StockingCostDto)
  stockingCost?: StockingCostDto;
}
