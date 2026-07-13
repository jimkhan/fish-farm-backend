import { IsString, MinLength } from 'class-validator';

/** `PasswordResetConfirm` schema (contracts/openapi.yaml, CON-004). */
export class PasswordResetConfirmDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
