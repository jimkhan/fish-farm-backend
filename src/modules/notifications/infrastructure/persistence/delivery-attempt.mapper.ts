import { DeliveryAttempt } from '../../domain/delivery-attempt.entity';
import { DeliveryAttemptPersistenceModel } from './delivery-attempt.persistence-model';

export function toDomain(model: DeliveryAttemptPersistenceModel): DeliveryAttempt {
  return DeliveryAttempt.reconstitute({
    id: model.id,
    alertId: model.alertId,
    channel: model.channel,
    status: model.status,
    attemptedAt: model.attemptedAt,
    error: model.error,
  });
}

export function toPersistence(entity: DeliveryAttempt): DeliveryAttemptPersistenceModel {
  const model = new DeliveryAttemptPersistenceModel();
  model.id = entity.id;
  model.alertId = entity.alertId;
  model.channel = entity.channel;
  model.status = entity.status;
  model.attemptedAt = entity.attemptedAt;
  model.error = entity.error;
  return model;
}
