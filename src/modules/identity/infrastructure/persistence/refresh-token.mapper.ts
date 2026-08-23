import { RefreshToken } from '../../domain/refresh-token.entity';
import { RefreshTokenPersistenceModel } from './refresh-token.persistence-model';

export function toDomain(model: RefreshTokenPersistenceModel): RefreshToken {
  return RefreshToken.reconstitute({
    id: model.id,
    userId: model.userId,
    familyId: model.familyId,
    tokenHash: model.tokenHash,
    expiresAt: model.expiresAt,
    revokedAt: model.revokedAt,
    rotatedAt: model.rotatedAt,
  });
}

export function toPersistence(entity: RefreshToken): RefreshTokenPersistenceModel {
  const model = new RefreshTokenPersistenceModel();
  model.id = entity.id;
  model.userId = entity.userId;
  model.familyId = entity.familyId;
  model.tokenHash = entity.tokenHash;
  model.expiresAt = entity.expiresAt;
  model.revokedAt = entity.revokedAt;
  model.rotatedAt = entity.rotatedAt;
  return model;
}
