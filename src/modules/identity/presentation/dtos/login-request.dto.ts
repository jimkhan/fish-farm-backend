import { IsEmail, IsString, MinLength } from 'class-validator';

/** `LoginRequest` schema (contracts/openapi.yaml, CON-001). */
export class LoginRequestDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
