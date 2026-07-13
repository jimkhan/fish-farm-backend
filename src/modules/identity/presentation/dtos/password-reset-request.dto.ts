import { IsEmail } from 'class-validator';

/** `PasswordResetRequest` schema (contracts/openapi.yaml, CON-003). */
export class PasswordResetRequestDto {
  @IsEmail()
  email!: string;
}
