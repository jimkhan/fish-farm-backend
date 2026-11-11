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
  // MOD-10 / TASK-036 (ADR-018): OpenWeather API key. Provisioned here by TASK-048 (deployment
  // topology) ahead of TASK-036's own weather adapter — optional now, no consumer reads it yet;
  // the adapter fails CHANNEL_UNAVAILABLE-style graceful degradation (NFR-007) when unset.
  OPENWEATHER_API_KEY: Joi.string().optional(),
  // MOD-10 / TASK-035 (ADR-012): the per-site MediaMTX service's base URL, reachable from the
  // `api` container over the compose network. Provisioned here by TASK-048 ahead of TASK-035's
  // camera-config endpoint — optional now, no consumer reads it yet.
  MEDIA_SERVER_BASE_URL: Joi.string().uri().optional(),
  // Observability (NFR-005 traceability): the structured logger in `shared-kernel/logging`.
  // `LOG_LEVEL` is the minimum level emitted (defaults: `debug` in development, `log` elsewhere);
  // `LOG_FORMAT` picks one-JSON-object-per-line for log shippers or a coloured human-readable
  // line for a terminal (defaults: `pretty` in development, `json` elsewhere); `LOG_HTTP_BODY`
  // additionally includes the redacted request body in every request log line — off by default
  // because bodies are the noisiest field and carry PII even after redaction.
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'log', 'debug', 'verbose').optional(),
  LOG_FORMAT: Joi.string().valid('json', 'pretty').optional(),
  LOG_HTTP_BODY: Joi.boolean().default(false),
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
  OPENWEATHER_API_KEY?: string;
  MEDIA_SERVER_BASE_URL?: string;
  LOG_LEVEL?: 'fatal' | 'error' | 'warn' | 'log' | 'debug' | 'verbose';
  LOG_FORMAT?: 'json' | 'pretty';
  LOG_HTTP_BODY: boolean;
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
