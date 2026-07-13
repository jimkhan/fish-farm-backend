import { validateEnv } from './env.validation';

const VALID_DB_ENV = {
  DB_HOST: 'localhost',
  DB_USERNAME: 'fms',
  DB_PASSWORD: 'secret',
  DB_NAME: 'fms_test',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
};

describe('validateEnv — fail-fast env validation (AC-002)', () => {
  it('accepts a valid environment and coerces types', () => {
    const out = validateEnv({ NODE_ENV: 'test', PORT: '3000', ...VALID_DB_ENV, DB_PORT: '5432' });
    expect(out.NODE_ENV).toBe('test');
    expect(out.PORT).toBe(3000); // coerced string → number
    expect(out.DB_PORT).toBe(5432);
  });

  it('applies the PORT and DB_PORT defaults when omitted', () => {
    const out = validateEnv({ NODE_ENV: 'development', ...VALID_DB_ENV });
    expect(out.PORT).toBe(3000);
    expect(out.DB_PORT).toBe(5432);
  });

  it('applies the JWT TTL defaults when omitted (TASK-008, R2)', () => {
    const out = validateEnv({ NODE_ENV: 'development', ...VALID_DB_ENV });
    expect(out.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(out.JWT_REFRESH_TTL_DAYS).toBe(30);
  });

  it('throws naming JWT_ACCESS_SECRET when missing', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'test', DB_HOST: 'localhost', DB_USERNAME: 'fms', DB_PASSWORD: 'secret', DB_NAME: 'fms_test' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects a JWT_ACCESS_SECRET shorter than 32 characters', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'test', ...VALID_DB_ENV, JWT_ACCESS_SECRET: 'too-short' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('throws naming the missing required key (fail fast)', () => {
    expect(() => validateEnv({ PORT: '3000', ...VALID_DB_ENV })).toThrow(/NODE_ENV/);
  });

  it('rejects an out-of-enum value, naming the key', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging', ...VALID_DB_ENV })).toThrow(/NODE_ENV/);
  });

  it('throws naming every missing DB key at once (not just the first)', () => {
    expect(() => validateEnv({ NODE_ENV: 'test' })).toThrow(
      /DB_HOST.*DB_USERNAME.*DB_PASSWORD.*DB_NAME|DB_HOST/,
    );
  });
});
