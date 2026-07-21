import { DomainError } from '../../../shared-kernel/errors/domain-error';

/**
 * F3 (TASK-040): a queued `entity` type whose backend dispatch target doesn't exist yet
 * (`POND_ACTION` — TASK-025, pond-bottom/aeration logs, isn't built). Never silently dropped
 * (R6-style discipline, same as every other "never silently lost" rule this session) — the
 * mutation reports `FAILED` with this explicit reason and stays queued for retry once TASK-025
 * lands, rather than being routed to a use-case that doesn't exist.
 */
export class UnsupportedSyncEntityError extends DomainError {
  readonly code = 'UNSUPPORTED_SYNC_ENTITY';
  readonly httpStatus = 422;

  constructor(entity: string, details?: Record<string, unknown>) {
    super(`Syncing "${entity}" is not yet supported.`, details);
  }
}
