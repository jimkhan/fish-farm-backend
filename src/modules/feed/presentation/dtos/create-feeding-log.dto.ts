import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';
import { FeedObservation } from '../../domain/feeding-log.entity';

const FEED_OBSERVATIONS: FeedObservation[] = ['NORMAL', 'LEFTOVER', 'EMPTY'];

/** `CreateFeedingLog` schema (contracts/openapi.yaml, CON-018). */
export class CreateFeedingLogDto {
  @IsUUID()
  inventoryItemId!: string;

  @IsNumber()
  @IsPositive()
  qtyKg!: number;

  @IsDateString()
  fedAt!: string;

  @IsOptional()
  @IsIn(FEED_OBSERVATIONS)
  observation?: FeedObservation;

  @IsString()
  clientMutationId!: string;
}
