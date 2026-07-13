import { Alert } from '../../domain/alert.entity';
import { AlertPersistenceModel } from './alert.persistence-model';

export function toDomain(model: AlertPersistenceModel): Alert {
  return Alert.reconstitute({
    id: model.id,
    projectId: model.projectId,
    type: model.type,
    severity: model.severity,
    state: model.state,
    message: model.message,
    sourceRef: model.sourceRef,
    raisedAt: model.raisedAt,
    acknowledgedAt: model.acknowledgedAt,
    resolvedAt: model.resolvedAt,
    escalatedAt: model.escalatedAt,
  });
}

export function toPersistence(entity: Alert): AlertPersistenceModel {
  const model = new AlertPersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.type = entity.type;
  model.severity = entity.severity;
  model.state = entity.state;
  model.message = entity.message;
  model.sourceRef = entity.sourceRef;
  model.dedupKey = entity.dedupKey;
  model.raisedAt = entity.raisedAt;
  model.acknowledgedAt = entity.acknowledgedAt;
  model.resolvedAt = entity.resolvedAt;
  model.escalatedAt = entity.escalatedAt;
  return model;
}
