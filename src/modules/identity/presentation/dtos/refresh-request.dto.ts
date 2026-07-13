import { IsString, MinLength } from 'class-validator';

/** `RefreshRequest` schema (contracts/openapi.yaml, CON-002). */
export class RefreshRequestDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
