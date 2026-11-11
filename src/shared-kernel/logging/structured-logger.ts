import { Injectable, LogLevel, LoggerService, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { redact } from './redact';

export type LogFormat = 'json' | 'pretty';

export interface StructuredLoggerOptions {
  /** Minimum level emitted; anything less severe is dropped. */
  level: LogLevel;
  /** `json`: one object per line for shippers/`docker logs`. `pretty`: coloured, for a terminal. */
  format: LogFormat;
}

/** Severity order (Nest's names). `log` is what other ecosystems call `info`. */
const LEVEL_RANK: Record<LogLevel, number> = {
  verbose: 0,
  debug: 1,
  log: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

/** Wire label per level — `log` becomes the conventional `info` so dashboards need no mapping. */
const LEVEL_LABEL: Record<LogLevel, string> = {
  verbose: 'trace',
  debug: 'debug',
  log: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'fatal',
};

const ANSI: Record<LogLevel, string> = {
  verbose: '\x1b[90m', // grey
  debug: '\x1b[36m', // cyan
  log: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  fatal: '\x1b[35m', // magenta
};
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/** Nest's own heuristic for "this string is a stack trace" (a message line then `at …` frames). */
const STACK_FORMAT = /^(.)+\n\s+at .+:\d+:\d+/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Error) &&
    !(value instanceof Date)
  );
}

/** JSON.stringify that never throws: BigInt → string, cycles → marker. */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (typeof inner === 'bigint') return inner.toString();
    if (typeof inner === 'object' && inner !== null) {
      if (seen.has(inner)) return '[Circular]';
      seen.add(inner);
    }
    return inner;
  });
}

export interface LogRecord {
  ts: string;
  level: string;
  context?: string;
  msg: string;
  [field: string]: unknown;
}

/**
 * Application-wide structured logger (shared kernel, NFR-005 traceability). Installed once in
 * `main.ts` via `app.useLogger()`, so every `new Logger(Context)` in the codebase — and Nest's
 * own framework messages — flows through here and comes out in one consistent shape.
 *
 * Accepts every calling convention Nest's `Logger` forwards:
 *  - `logger.log('plain message')`
 *  - `logger.log({ msg: 'event', field: 1 })` — object messages become top-level fields
 *  - `logger.error('message', stack)` / `logger.error(new Error(…))` — stacks are kept as `stack`
 *  - a trailing string parameter is the Nest context (`[ClassName]`)
 *
 * Levels resolve from `LOG_LEVEL` (default `debug` in development, `log` elsewhere) and the
 * shape from `LOG_FORMAT` (default `pretty` in development, `json` elsewhere).
 */
@Injectable()
export class StructuredLogger implements LoggerService {
  private options: StructuredLoggerOptions;
  private colors: boolean;

  constructor(@Optional() config?: ConfigService) {
    const nodeEnv = config?.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? 'development';
    const isDev = nodeEnv === 'development';
    this.options = {
      level: config?.get<LogLevel>('LOG_LEVEL') ?? (isDev ? 'debug' : 'log'),
      format: config?.get<LogFormat>('LOG_FORMAT') ?? (isDev ? 'pretty' : 'json'),
    };
    this.colors = this.options.format === 'pretty' && Boolean(process.stdout.isTTY);
  }

  /**
   * Explicit-options constructor for scripts and tests, bypassing `ConfigService`. Kept off the
   * DI constructor so Nest never tries to resolve a second parameter.
   */
  static withOptions(options: StructuredLoggerOptions): StructuredLogger {
    const logger = new StructuredLogger();
    logger.options = { ...options };
    logger.colors = options.format === 'pretty' && Boolean(process.stdout.isTTY);
    return logger;
  }

  get level(): LogLevel {
    return this.options.level;
  }

  get format(): LogFormat {
    return this.options.format;
  }

  isLevelEnabled(level: LogLevel): boolean {
    return LEVEL_RANK[level] >= LEVEL_RANK[this.options.level];
  }

  /** Nest calls this when `app.useLogger([...levels])` is used; we honour the lowest given. */
  setLogLevels(levels: LogLevel[]): void {
    if (levels.length === 0) return;
    const lowest = levels.reduce((a, b) => (LEVEL_RANK[a] <= LEVEL_RANK[b] ? a : b));
    this.options = { ...this.options, level: lowest };
  }

  log(message: unknown, ...params: unknown[]): void {
    this.write('log', message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.write('verbose', message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.write('fatal', message, params);
  }

  /** Builds the record without emitting it — exposed for tests and for callers that pre-format. */
  buildRecord(level: LogLevel, message: unknown, params: unknown[]): LogRecord {
    const rest = [...params];

    // Nest's `Logger` appends its context as the final string argument.
    let context: string | undefined;
    if (rest.length > 0 && typeof rest[rest.length - 1] === 'string') {
      const candidate = rest[rest.length - 1] as string;
      if (!STACK_FORMAT.test(candidate)) {
        context = candidate;
        rest.pop();
      }
    }

    const record: LogRecord = {
      ts: new Date().toISOString(),
      level: LEVEL_LABEL[level],
      ...(context !== undefined && { context }),
      msg: '',
    };

    let stack: string | undefined;
    const extras: unknown[] = [];

    const absorb = (value: unknown, asMessage: boolean): void => {
      if (value instanceof Error) {
        if (asMessage || record.msg === '') record.msg = value.message;
        record.errorName = value.name;
        stack = stack ?? value.stack;
        return;
      }
      if (typeof value === 'string' && !asMessage && STACK_FORMAT.test(value)) {
        stack = stack ?? value;
        return;
      }
      if (isPlainObject(value)) {
        const { msg, message: innerMessage, ...fields } = value;
        const text =
          typeof msg === 'string' ? msg : typeof innerMessage === 'string' ? innerMessage : '';
        if (asMessage || record.msg === '') record.msg = text;
        Object.assign(record, redact(fields));
        return;
      }
      if (asMessage) {
        record.msg = typeof value === 'string' ? value : String(value);
        return;
      }
      extras.push(redact(value));
    };

    absorb(message, true);
    for (const param of rest) absorb(param, false);

    if (extras.length > 0) record.extra = extras;
    if (stack !== undefined) record.stack = stack;
    return record;
  }

  private write(level: LogLevel, message: unknown, params: unknown[]): void {
    if (!this.isLevelEnabled(level)) return;
    const record = this.buildRecord(level, message, params);
    const line =
      this.options.format === 'json' ? safeStringify(record) : this.pretty(level, record);
    const stream = LEVEL_RANK[level] >= LEVEL_RANK.error ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
  }

  private pretty(level: LogLevel, record: LogRecord): string {
    const { ts, level: label, context, msg, stack, ...fields } = record;
    const color = this.colors ? ANSI[level] : '';
    const dim = this.colors ? DIM : '';
    const reset = this.colors ? RESET : '';

    const time = ts.slice(11, 23); // HH:mm:ss.SSS — the date is noise in a live terminal
    const head = `${dim}${time}${reset} ${color}${label.toUpperCase().padEnd(5)}${reset}`;
    const ctx = context ? ` ${color}[${context}]${reset}` : '';
    const kv = Object.entries(fields)
      .map(([k, v]) => `${dim}${k}=${reset}${typeof v === 'string' ? v : safeStringify(v)}`)
      .join(' ');
    const tail = stack ? `\n${dim}${String(stack)}${reset}` : '';
    return `${head}${ctx} ${msg}${kv ? `  ${kv}` : ''}${tail}`;
  }
}
