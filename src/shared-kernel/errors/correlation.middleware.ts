import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';

export const CORRELATION_HEADER = 'x-correlation-id';

/** Accept only well-formed client-supplied ids; anything else is replaced, never echoed raw. */
const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * The minimal request/response slice this middleware touches — structural on purpose so the
 * shared kernel does not depend on `@types/express`.
 */
export interface RequestWithCorrelationId {
  headers: Record<string, string | string[] | undefined>;
  correlationId?: string;
}

export interface CorrelationResponse {
  setHeader(name: string, value: string): void;
}

/**
 * Assigns every request a correlation id (TASK-003, NFR-005). Honors a well-formed
 * `x-correlation-id` from the client/gateway, otherwise mints a UUID; always echoes it on the
 * response so any error can be traced end to end (MOD-01 §2.6 "ref: <id>").
 */
@Injectable()
export class CorrelationMiddleware
  implements NestMiddleware<RequestWithCorrelationId, CorrelationResponse>
{
  use(req: RequestWithCorrelationId, res: CorrelationResponse, next: () => void): void {
    const supplied = req.headers[CORRELATION_HEADER];
    const id =
      typeof supplied === 'string' && SAFE_ID.test(supplied) ? supplied : randomUUID();

    req.correlationId = id;
    res.setHeader(CORRELATION_HEADER, id);
    next();
  }
}
