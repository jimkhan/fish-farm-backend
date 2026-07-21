import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';
import { FinancialCategory, FinancialKind } from '../../domain/category.vo';

const FINANCIAL_KINDS: FinancialKind[] = ['COST', 'REVENUE'];
const FINANCIAL_CATEGORIES: FinancialCategory[] = [
  'FEED',
  'SALARY',
  'MEDICINE',
  'STOCKING',
  'EQUIPMENT',
  'MISC',
  'HARVEST',
];

/** Nested `Money` shape, minus `currency` — never a user choice (ADR-018), same pattern as `CreateStockingDto.stockingCost`. */
export class FinancialTxnAmountDto {
  @IsInt()
  @IsPositive()
  amountMinor!: number;
}

/** `CreateFinancialTxn` schema (contracts/openapi.yaml, CON-033). */
export class CreateFinancialTxnDto {
  @IsIn(FINANCIAL_KINDS)
  kind!: FinancialKind;

  @IsIn(FINANCIAL_CATEGORIES)
  category!: FinancialCategory;

  @ValidateNested()
  @Type(() => FinancialTxnAmountDto)
  amount!: FinancialTxnAmountDto;

  @IsDateString()
  occurredOn!: string;

  @IsOptional()
  @IsString()
  sourceRef?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
