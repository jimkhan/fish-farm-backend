import { IsDateString, IsOptional, IsString } from 'class-validator';

/** `CreateTaskLog` schema (contracts/openapi.yaml, CON-031). */
export class CreateTaskLogDto {
  @IsDateString()
  completedAt!: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsString()
  clientMutationId!: string;
}
