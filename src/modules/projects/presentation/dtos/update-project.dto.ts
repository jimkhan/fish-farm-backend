import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ProjectStatus } from '../../domain/project.entity';

/** `UpdateProject` schema (contracts/openapi.yaml, CON-009) — only `name`/`address`/`status` are editable. */
export class UpdateProjectDto {
  // `@IsNotEmpty()` mirrors CreateProjectDto. Without it `{"name":""}` was accepted and, because
  // `Project.withUpdate` merges with `??` (and `''` is not nullish), it actually blanked the name
  // everywhere the project is displayed.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'CLOSED'])
  status?: ProjectStatus;
}
