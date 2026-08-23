import { IsDateString, IsInt, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

/** `CreateTask` schema (contracts/openapi.yaml, CON-030). */
export class CreateTaskDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsUUID()
  pondId?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  recurrenceDays?: number;

  @IsOptional()
  @IsDateString()
  dueOn?: string;

  @IsOptional()
  @IsUUID()
  assigneeUserId?: string;
}
