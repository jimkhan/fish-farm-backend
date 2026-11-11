import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantState } from '../tenant/tenant-context';
import { redact } from './redact';
import { RequestWithLogState } from './request-log-state';

/**
 * Request/response slice the middleware reads — structural on purpose (no `@types/express`),
 * matching the rest of the shared kernel. Everything optional is populated later in the
 * pipeline (auth middleware, tenant guard, router, interceptor, filter) and read at finish time.
 */
export interface LoggedRequest extends RequestWithLogState {
  method: string;
  url: string;
  originalUrl?: string;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
  route?: { path?: string };
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  correlationId?: string;
  user?: { id: string };
  tenant?: TenantState;
}

export interface LoggedResponse {
  statusCode: number;
  getHeader(name: string): number | string | string[] | undefined;
  on(event: 'finish' | 'close', listener: () => void): unknown;
}

/** Shape of the one line emitted per request (`event: "http.request"`). */
export interface HttpRequestLog {
  event: 'http.request';
  method: string;
  path: string;
  route: string | null;
  status: number;
  durationMs: number;
  correlationId: string | null;
  userId: string | null;
  projectId: string | null;
  role: string | null;
  handler: string | null;
  ip: string | null;
  userAgent: string | null;
  responseBytes: number | null;
  aborted?: true;
  query?: unknown;
  body?: unknown;
  errorCode?: string;
  errorMessage?: string;
  errorDetails?: Record<string, unknown>;
}

const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function firstHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function clientIp(req: LoggedRequest): string | null {
  // Behind Caddy/any reverse proxy the socket address is the proxy; the forwarded chain's first
  // hop is the client. Never trusted for authz — this is a log field only.
  const forwarded = firstHeader(req.headers['x-forwarded-for']);
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

function pathOnly(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

/**
 * Emits exactly one structured line per HTTP request, when the response finishes (or the
 * client goes away first). Middleware — not an interceptor — because middleware is the only
 * stage that sees *every* request: ones rejected by `AuthMiddleware` (401), by a guard (403),
 * by `ValidationPipe` (400), and ones that matched no route at all (404) never reach an
 * interceptor. The correlation id, user, tenant, handler and error code are all read lazily at
 * finish time, so middleware ordering relative to the pieces that set them does not matter.
 *
 * Severity follows the outcome: 5xx → `error`, 4xx → `warn`, everything else → `log`. A
 * `debug`-level "→ METHOD /path" line is also written on arrival so a hanging request is
 * still visible before it completes.
 */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware<LoggedRequest, LoggedResponse> {
  private readonly logger = new Logger('Http');
  private readonly logBody: boolean;

  constructor(config: ConfigService) {
    this.logBody = config.get<boolean>('LOG_HTTP_BODY', false) === true;
  }

  use(req: LoggedRequest, res: LoggedResponse, next: () => void): void {
    const startedAt = process.hrtime.bigint();
    const path = pathOnly(req.originalUrl ?? req.url);

    this.logger.debug({
      msg: `→ ${req.method} ${path}`,
      event: 'http.request.start',
      method: req.method,
      path,
      correlationId: req.correlationId ?? null,
    });

    let emitted = false;
    const emit = (aborted: boolean): void => {
      if (emitted) return;
      emitted = true;
      this.emit(req, res, path, startedAt, aborted);
    };
    res.on('finish', () => emit(false));
    res.on('close', () => emit(true));
    next();
  }

  private emit(
    req: LoggedRequest,
    res: LoggedResponse,
    path: string,
    startedAt: bigint,
    aborted: boolean,
  ): void {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const status = res.statusCode;
    const contentLength = firstHeader(res.getHeader('content-length') as string | undefined);

    const entry: HttpRequestLog = {
      event: 'http.request',
      method: req.method,
      path,
      route: req.route?.path ?? null,
      status,
      durationMs: Math.round(durationMs * 10) / 10,
      correlationId: req.correlationId ?? null,
      userId: req.user?.id ?? req.tenant?.userId ?? null,
      projectId: req.tenant?.projectId ?? null,
      role: req.tenant?.role ?? null,
      handler: req.log?.handler ?? null,
      ip: clientIp(req),
      userAgent: firstHeader(req.headers['user-agent']),
      responseBytes: contentLength !== null ? Number(contentLength) : null,
    };
    if (aborted) entry.aborted = true;

    if (req.query && Object.keys(req.query).length > 0) {
      entry.query = redact(req.query);
    }
    if (this.logBody && !BODYLESS_METHODS.has(req.method) && req.body !== undefined) {
      entry.body = redact(req.body);
    }
    if (req.log?.error) {
      entry.errorCode = req.log.error.code;
      entry.errorMessage = req.log.error.message;
      if (req.log.error.details) entry.errorDetails = req.log.error.details;
    }

    const summary = `${req.method} ${entry.route ?? path} ${status} ${entry.durationMs}ms`;
    const payload = { msg: summary, ...entry };
    if (status >= 500) this.logger.error(payload);
    else if (status >= 400) this.logger.warn(payload);
    else this.logger.log(payload);
  }
}
