import { IsIn, IsOptional, IsString } from 'class-validator';
import { ProjectStatus } from '../../domain/project.entity';

/** `UpdateProject` schema (contracts/openapi.yaml, CON-009) — only `name`/`address`/`status` are editable. */
export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'CLOSED'])
  status?: ProjectStatus;
}
