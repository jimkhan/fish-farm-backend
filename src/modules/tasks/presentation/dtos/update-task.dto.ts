import { IsDateString, IsInt, IsOptional, IsPositive, IsString, IsUUID, ValidateIf } from 'class-validator';

/** `UpdateTask` schema (contracts/openapi.yaml) — all fields optional; null clears pond/assignee/recurrence. */
export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  pondId?: string | null;

  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  @IsPositive()
  recurrenceDays?: number | null;

  @IsOptional()
  @IsDateString()
  dueOn?: string;

  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  assigneeUserId?: string | null;
}
