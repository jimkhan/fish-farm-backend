import { Device } from '../../domain/device.entity';
import { DevicePersistenceModel } from './device.persistence-model';

export function toDomain(model: DevicePersistenceModel): Device {
  return Device.reconstitute({
    id: model.id,
    projectId: model.projectId,
    pondId: model.pondId,
    deviceKeyHash: model.deviceKeyHash,
    label: model.label,
    registeredAt: model.registeredAt,
  });
}

export function toPersistence(entity: Device): DevicePersistenceModel {
  const model = new DevicePersistenceModel();
  model.id = entity.id;
  model.projectId = entity.projectId;
  model.pondId = entity.pondId;
  model.deviceKeyHash = entity.deviceKeyHash;
  model.label = entity.label;
  model.registeredAt = entity.registeredAt;
  return model;
}
