import { DeliveryAttempt } from '../../domain/delivery-attempt.entity';

/** Unscoped by project — see `DeliveryAttempt`'s doc comment. Runs on `DomainEventBus` delivery. */
export interface DeliveryAttemptRepositoryPort {
  save(attempt: DeliveryAttempt): Promise<DeliveryAttempt>;
}

export const DELIVERY_ATTEMPT_REPOSITORY = 'DeliveryAttemptRepositoryPort';
