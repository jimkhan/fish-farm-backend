import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { CORRELATION_HEADER, RequestWithCorrelationId } from './correlation.middleware';
import { DomainError } from './domain-error';

/** Wire shape of the shared `Error` schema (contracts/openapi.yaml `components.schemas.Error`). */
export interface ErrorResponseBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  correlationId: string;
}

/** Response slice the filter needs — structural, so no `@types/express` dependency. */
interface ErrorResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ErrorResponse;
  json(body: ErrorResponseBody): void;
}

/** Codes for framework-raised `HttpException`s (ValidationPipe 400s, unknown routes, …). */
const CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE',
};

/**
 * Global exception filter (TASK-003, FT-006, AC-008). Every error leaving the API — typed
 * `DomainError`, framework `HttpException`, or unknown — is shaped as the shared `Error`
 * schema with a correlation id. Unknown errors become `INTERNAL`/500 with the real cause
 * logged server-side and never leaked to the client (NFR-005).
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<ErrorResponse>();
    const req = ctx.getRequest<RequestWithCorrelationId>();

    // Middleware normally sets this; fall back so an error response always carries a ref.
    const correlationId = req.correlationId ?? randomUUID();
    res.setHeader(CORRELATION_HEADER, correlationId);

    if (exception instanceof DomainError) {
      res.status(exception.httpStatus).json({
        code: exception.code,
        message: exception.message,
        ...(exception.details !== undefined && { details: exception.details }),
        correlationId,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      // Nest packs ValidationPipe failures as { message: string[], error, statusCode }.
      const message =
        typeof payload === 'string'
          ? payload
          : Array.isArray((payload as { message?: unknown }).message)
            ? 'Validation failed.'
            : String((payload as { message?: unknown }).message ?? exception.message);
      const details =
        typeof payload === 'object' && Array.isArray((payload as { message?: unknown }).message)
          ? { errors: (payload as { message: unknown[] }).message }
          : undefined;

      res.status(status).json({
        code:
          CODE_BY_STATUS[status] ??
          (status >= HttpStatus.INTERNAL_SERVER_ERROR ? 'INTERNAL' : `HTTP_${status}`),
        message,
        ...(details !== undefined && { details }),
        correlationId,
      });
      return;
    }

    // Unknown error: log the truth server-side, return an opaque reference to the client.
    const cause = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`[${correlationId}] ${cause.message}`, cause.stack);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL',
      message: `Something went wrong (ref: ${correlationId}).`,
      correlationId,
    });
  }
}
