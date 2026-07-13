import * as Joi from 'joi';

/**
 * Environment schema. Every config value the app needs is declared here and validated
 * at boot; validation is fail-fast (AC-002, NFR-005). No secrets have defaults — a missing
 * required key aborts startup with a message naming the key. Extend this schema as modules
 * introduce config (DB url, JWT secret, FCM key, …), never `process.env` reads scattered in code.
 */
export const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').required(),
  PORT: Joi.number().port().default(3000),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  // MOD-02 / TASK-008 (ADR-005): access tokens are short-lived signed JWTs (sub only, no
  // role/project — R3); refresh tokens are opaque secrets stored hashed, never JWTs themselves.
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL_SECONDS: Joi.number().integer().positive().default(900), // 15 min, R2
  JWT_REFRESH_TTL_DAYS: Joi.number().integer().positive().default(30), // R2
  // MOD-02 / TASK-009 (R9): password-reset tokens are single-use and time-boxed.
  PASSWORD_RESET_TTL_MINUTES: Joi.number().integer().positive().default(30),
  // MOD-09 / TASK-016 (R9): FCM legacy HTTP API server key. Optional — no default, and unset
  // simply means `FcmAdapter.send()` reports CHANNEL_UNAVAILABLE (graceful degradation, same
  // shape as the SMS/WhatsApp stubs) rather than failing app boot; a production deployment sets
  // it, dev/test environments need not.
  FCM_SERVER_KEY: Joi.string().optional(),
}).unknown(true);

export interface AppEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DB_HOST: string;
  DB_PORT: number;
  DB_USERNAME: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_TTL_SECONDS: number;
  JWT_REFRESH_TTL_DAYS: number;
  PASSWORD_RESET_TTL_MINUTES: number;
  FCM_SERVER_KEY?: string;
}

/**
 * Custom `validate` for `@nestjs/config`. Throws (aborting boot) when the environment is
 * invalid, listing every offending key rather than only the first (AC-002).
 */
export function validateEnv(config: Record<string, unknown>): AppEnv {
  const { error, value } = envSchema.validate(config, { abortEarly: false, convert: true });
  if (error) {
    const keys = error.details.map((d) => String(d.context?.key ?? d.path.join('.'))).join(', ');
    throw new Error(`Config validation failed for: ${keys}. ${error.message}`);
  }
  return value as AppEnv;
}
