import { StructuredLogger } from './structured-logger';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  const outSpy = jest
    .spyOn(process.stdout, 'write')
    .mockImplementation(((chunk: string) => (out.push(String(chunk)), true)) as never);
  const errSpy = jest
    .spyOn(process.stderr, 'write')
    .mockImplementation(((chunk: string) => (err.push(String(chunk)), true)) as never);
  return { out, err, restore: () => (outSpy.mockRestore(), errSpy.mockRestore()) };
}

describe('StructuredLogger', () => {
  it('defaults from NODE_ENV: development → debug/pretty, production → log/json', () => {
    const dev = new StructuredLogger({
      get: (k: string) => (k === 'NODE_ENV' ? 'development' : undefined),
    } as never);
    expect(dev.level).toBe('debug');
    expect(dev.format).toBe('pretty');

    const prod = new StructuredLogger({
      get: (k: string) => (k === 'NODE_ENV' ? 'production' : undefined),
    } as never);
    expect(prod.level).toBe('log');
    expect(prod.format).toBe('json');
  });

  it('honours LOG_LEVEL / LOG_FORMAT from config', () => {
    const values: Record<string, string> = {
      NODE_ENV: 'development',
      LOG_LEVEL: 'warn',
      LOG_FORMAT: 'json',
    };
    const logger = new StructuredLogger({ get: (k: string) => values[k] } as never);
    expect(logger.level).toBe('warn');
    expect(logger.format).toBe('json');
    expect(logger.isLevelEnabled('log')).toBe(false);
    expect(logger.isLevelEnabled('error')).toBe(true);
  });

  it('emits one JSON object per line with ts/level/context/msg and object fields', () => {
    const logger = StructuredLogger.withOptions({ level: 'debug', format: 'json' });
    const { out, restore } = capture();
    try {
      logger.log({ msg: 'hello', event: 'x', n: 1 }, 'Ctx');
    } finally {
      restore();
    }
    expect(out).toHaveLength(1);
    const rec = JSON.parse(out[0]);
    expect(rec).toMatchObject({ level: 'info', context: 'Ctx', msg: 'hello', event: 'x', n: 1 });
    expect(rec.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('understands Nest error convention: (message, stack, context) → stack field, stderr', () => {
    const logger = StructuredLogger.withOptions({ level: 'debug', format: 'json' });
    const stack = 'Error: boom\n    at fn (file.ts:1:2)';
    const { out, err, restore } = capture();
    try {
      logger.error('boom', stack, 'Filter');
    } finally {
      restore();
    }
    expect(out).toHaveLength(0);
    const rec = JSON.parse(err[0]);
    expect(rec).toMatchObject({ level: 'error', context: 'Filter', msg: 'boom', stack });
  });

  it('accepts an Error instance as the message', () => {
    const logger = StructuredLogger.withOptions({ level: 'debug', format: 'json' });
    const rec = logger.buildRecord('error', new TypeError('bad'), ['Ctx']);
    expect(rec.msg).toBe('bad');
    expect(rec.errorName).toBe('TypeError');
    expect(typeof rec.stack).toBe('string');
  });

  it('redacts sensitive fields inside object messages', () => {
    const logger = StructuredLogger.withOptions({ level: 'debug', format: 'json' });
    const rec = logger.buildRecord('log', { msg: 'login', password: 'x', user: 'u' }, []);
    expect(rec.password).toBe('[REDACTED]');
    expect(rec.user).toBe('u');
  });

  it('drops records below the configured level', () => {
    const logger = StructuredLogger.withOptions({ level: 'warn', format: 'json' });
    const { out, restore } = capture();
    try {
      logger.log('ignored');
      logger.debug('ignored');
      logger.warn('kept');
    } finally {
      restore();
    }
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0]).msg).toBe('kept');
  });

  it('pretty format renders level, context, message and key=value pairs', () => {
    const logger = StructuredLogger.withOptions({ level: 'debug', format: 'pretty' });
    const { out, restore } = capture();
    try {
      logger.warn({ msg: 'slow', durationMs: 1200 }, 'Http');
    } finally {
      restore();
    }
    const line = out[0].replace(/\x1b\[[0-9;]*m/g, '');
    expect(line).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} WARN  \[Http\] slow  durationMs=1200\n$/);
  });
});
