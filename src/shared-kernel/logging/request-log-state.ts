/**
 * Per-request slot the logging pieces share. Stamped progressively as a request moves through
 * the pipeline — `handler` by `RequestLoggingInterceptor` once a route resolved,
 * `error` by `DomainExceptionFilter` when the response is a failure — and read once, when the
 * response finishes, by `RequestLoggingMiddleware` to emit the single summary line.
 */
export interface RequestLogError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface RequestLogState {
  /** `ControllerClass.methodName`; absent when nothing matched (404) or a guard rejected first. */
  handler?: string;
  /** Set by the exception filter so the request line explains *why* it failed. */
  error?: RequestLogError;
}

export interface RequestWithLogState {
  log?: RequestLogState;
}

export function stampRequestLog(req: RequestWithLogState, patch: RequestLogState): void {
  req.log = { ...req.log, ...patch };
}
