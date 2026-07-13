import { DomainError } from '../../../shared-kernel/errors/domain-error';

/** F1/R2 (AC-072, error table): a feed plan requested before the batch's first sampling never fabricates a quota. */
export class SamplingRequiredError extends DomainError {
  readonly code = 'SAMPLING_REQUIRED';
  readonly httpStatus = 409;

  constructor(details?: Record<string, unknown>) {
    super("Record a sampling to compute today's feed.", details);
  }
}

/** F5/R4 (AC-075, error table): a feeding logged against an inventory item of a different feed type is rejected. */
export class FeedTypeMismatchError extends DomainError {
  readonly code = 'FEED_TYPE_MISMATCH';
  readonly httpStatus = 400;

  constructor(details?: Record<string, unknown>) {
    super('Feed type does not match this inventory item.', details);
  }
}
