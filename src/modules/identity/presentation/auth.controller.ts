import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../../shared-kernel/auth/public.decorator';
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

/** Credential-guessing surface: tight enough to stop brute force, loose enough for real typos. */
const STRICT = {
  'auth-burst': { limit: 5, ttl: 60_000 },
  'auth-sustained': { limit: 20, ttl: 900_000 },
};

/** Token minting that also triggers outbound notification — the tightest bucket. */
const VERY_STRICT = {
  'auth-burst': { limit: 3, ttl: 60_000 },
  'auth-sustained': { limit: 10, ttl: 900_000 },
};

/**
 * Refresh is deliberately generous. The token is a 256-bit opaque random, so guessing it is
 * infeasible and throttling adds little; meanwhile the web app refreshes from Next.js
 * middleware on navigation, and several staff behind one farm-office NAT share a source IP.
 * A tight limit here would lock out real users to prevent an attack that can't succeed anyway.
 */
const LENIENT = {
  'auth-burst': { limit: 60, ttl: 60_000 },
  'auth-sustained': { limit: 400, ttl: 900_000 },
};

/**
 * `AuthController` (TASK-008/TASK-009, CON-001…CON-004). All routes are public (no bearer
 * token) — `security: []` in the contract, and exempted from the global `AuthenticatedGuard`
 * by `@Public()`.
 *
 * Being public and unauthenticated, these are the only routes an anonymous caller can reach at
 * will, so they carry per-IP rate limits (`ThrottlerGuard`). Without them, `POST /auth/login`
 * accepts unlimited password guesses — and, because each one runs an argon2id verification, it
 * doubles as a cheap CPU-exhaustion vector — while `POST /auth/password-reset/request` is an
 * unauthenticated trigger for token minting and (once a real mailer lands) outbound email to
 * any address a caller names.
 *
 * Limits key on client IP, so a deployment behind a reverse proxy must configure Express's
 * `trust proxy` — otherwise every request appears to come from the proxy and shares one bucket.
 * Follow-up worth carding: an additional per-email bucket on login, so one targeted account
 * can't be ground down from many source addresses.
 */
@Public()
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly refresh: RefreshUseCase,
    private readonly requestReset: RequestResetUseCase,
    private readonly confirmReset: ConfirmResetUseCase,
  ) {}

  @Post('login')
  @Throttle(STRICT)
  @HttpCode(HttpStatus.OK)
  async loginHandler(@Body() body: LoginRequestDto): Promise<AuthTokensResponse> {
    const result = await this.login.execute(body.email, body.password);
    return toResponse(result);
  }

  @Post('refresh')
  @Throttle(LENIENT)
  @HttpCode(HttpStatus.OK)
  async refreshHandler(@Body() body: RefreshRequestDto): Promise<AuthTokensResponse> {
    const result = await this.refresh.execute(body.refreshToken);
    return toResponse(result);
  }

  /** CON-003, AC-020. Always 202 — never discloses whether the email belongs to an account. */
  @Post('password-reset/request')
  @Throttle(VERY_STRICT)
  @HttpCode(HttpStatus.ACCEPTED)
  async requestResetHandler(@Body() body: PasswordResetRequestDto): Promise<void> {
    await this.requestReset.execute(body.email);
  }

  /** CON-004, AC-020. */
  @Post('password-reset/confirm')
  @Throttle(STRICT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmResetHandler(@Body() body: PasswordResetConfirmDto): Promise<void> {
    await this.confirmReset.execute(body.token, body.newPassword);
  }
}
