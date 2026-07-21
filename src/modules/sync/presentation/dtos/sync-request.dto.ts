import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsObject, IsString, ValidateNested } from 'class-validator';
import { SyncEntityType } from '../../domain/sync-mutation.entity';

const SYNC_ENTITIES: SyncEntityType[] = [
  'FEEDING_LOG',
  'MORTALITY',
  'WATER_READING',
  'TASK_LOG',
  'WATER_EVENT',
  'SAMPLING',
  'POND_ACTION',
];

/** One item of `SyncRequest.mutations` (contracts/openapi.yaml, CON-040). `payload` is
 * intentionally unstructured (`additionalProperties: true`) — each entity's own domain use-case
 * re-validates it (module doc §4.7). */
export class SyncMutationDto {
  @IsString()
  clientMutationId!: string;

  @IsIn(SYNC_ENTITIES)
  entity!: SyncEntityType;

  @IsIn(['CREATE'])
  op!: 'CREATE';

  @IsObject()
  payload!: Record<string, unknown>;
}

export class SyncRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SyncMutationDto)
  mutations!: SyncMutationDto[];
}
