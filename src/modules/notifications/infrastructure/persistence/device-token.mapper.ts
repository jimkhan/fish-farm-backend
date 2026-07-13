import { DeviceToken } from '../../domain/device-token.entity';
import { DeviceTokenPersistenceModel } from './device-token.persistence-model';

export function toDomain(model: DeviceTokenPersistenceModel): DeviceToken {
  return DeviceToken.reconstitute({
    id: model.id,
    userId: model.userId,
    fcmToken: model.fcmToken,
    platform: model.platform,
    registeredAt: model.registeredAt,
  });
}

export function toPersistence(entity: DeviceToken): DeviceTokenPersistenceModel {
  const model = new DeviceTokenPersistenceModel();
  model.id = entity.id;
  model.userId = entity.userId;
  model.fcmToken = entity.fcmToken;
  model.platform = entity.platform;
  model.registeredAt = entity.registeredAt;
  return model;
}
