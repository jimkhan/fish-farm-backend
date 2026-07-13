import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthTokensResult } from '../application/auth-tokens.result';
import { ConfirmResetUseCase } from '../application/confirm-reset.usecase';
import { LoginUseCase } from '../application/login.usecase';
import { RefreshUseCase } from '../application/refresh.usecase';
import { RequestResetUseCase } from '../application/request-reset.usecase';
import { LoginRequestDto } from './dtos/login-request.dto';
import { PasswordResetConfirmDto } from './dtos/password-reset-confirm.dto';
import { PasswordResetRequestDto } from './dtos/password-reset-request.dto';
import { RefreshRequestDto } from './dtos/refresh-request.dto';

/** Wire shape of the `AuthTokens` schema (contracts/openapi.yaml). */
interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

function toResponse(result: AuthTokensResult): AuthTokensResponse {
  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
  };
}

/**
 * `AuthController` (TASK-008/TASK-009, CON-001…CON-004). All routes are public (no bearer
 * token).
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly refresh: RefreshUseCase,
    private readonly requestReset: RequestResetUseCase,
    private readonly confirmReset: ConfirmResetUseCase,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async loginHandler(@Body() body: LoginRequestDto): Promise<AuthTokensResponse> {
    const result = await this.login.execute(body.email, body.password);
    return toResponse(result);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshHandler(@Body() body: RefreshRequestDto): Promise<AuthTokensResponse> {
    const result = await this.refresh.execute(body.refreshToken);
    return toResponse(result);
  }

  /** CON-003, AC-020. Always 202 — never discloses whether the email belongs to an account. */
  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestResetHandler(@Body() body: PasswordResetRequestDto): Promise<void> {
    await this.requestReset.execute(body.email);
  }

  /** CON-004, AC-020. */
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmResetHandler(@Body() body: PasswordResetConfirmDto): Promise<void> {
    await this.confirmReset.execute(body.token, body.newPassword);
  }
}
