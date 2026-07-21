import { FinancialTxn } from '../../domain/financial-txn.entity';
import { FinancialTxnPersistenceModel } from './financial-txn.persistence-model';

export function toDomain(model: FinancialTxnPersistenceModel): FinancialTxn {
  return FinancialTxn.reconstitute({
    id: model.id,
    projectId: model.projectId,
    kind: model.kind,
    category: model.category,
    amountMinor: model.amountMinor,
    occurredOn: new Date(model.occurredOn),
    sourceRef: model.sourceRef,
    note: model.note,
    createdAt: model.createdAt,
  });
}

export function toPersistence(entity: FinancialTxn): FinancialTxnPersistenceModel {
  const model = new FinancialTxnPersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.kind = entity.kind;
  model.category = entity.category;
  model.amountMinor = entity.amountMinor;
  model.occurredOn = entity.occurredOn;
  model.sourceRef = entity.sourceRef;
  model.note = entity.note;
  model.createdAt = entity.createdAt;
  return model;
}
