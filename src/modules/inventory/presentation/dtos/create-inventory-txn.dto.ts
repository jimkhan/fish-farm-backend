import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';

/**
 * Nested `Money` shape, minus `currency` — never a user choice (ADR-018), same pattern as
 * `CreateStockingDto`'s `stockingCost`.
 */
export class InventoryTxnCostDto {
  @IsInt()
  @IsPositive()
  amountMinor!: number;
}

/** `CreateInventoryTxn` schema (contracts/openapi.yaml, CON-024) + optional `cost` (AC-082/R8). */
export class CreateInventoryTxnDto {
  @IsNumber()
  delta!: number;

  @IsString()
  reason!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => InventoryTxnCostDto)
  cost?: InventoryTxnCostDto;
}
