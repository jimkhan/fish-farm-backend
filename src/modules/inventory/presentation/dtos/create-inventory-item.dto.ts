import { IsIn, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { FeedType } from '../../domain/inventory-item.entity';

/** `CreateInventoryItem` schema (contracts/openapi.yaml, CON-023). */
export class CreateInventoryItemDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsIn(['FLOATING', 'SINKING', 'NURSERY_DUST'])
  feedType?: FeedType;

  @IsString()
  unit!: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  lowStockThreshold?: number;
}
