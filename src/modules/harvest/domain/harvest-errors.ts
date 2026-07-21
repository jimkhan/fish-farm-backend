import { DomainError } from '../../../shared-kernel/errors/domain-error';

/** F7/R8 (AC-103, error table): a harvest quantity exceeding the batch's remaining survival estimate is rejected. */
export class HarvestExceedsStockError extends DomainError {
  readonly code = 'HARVEST_EXCEEDS_STOCK';
  readonly httpStatus = 409;

  constructor(details?: Record<string, unknown>) {
    super('Harvest exceeds remaining stock.', details);
  }
}
