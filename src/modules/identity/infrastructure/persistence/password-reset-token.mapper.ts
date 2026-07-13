import { PasswordResetToken } from '../../domain/password-reset-token.entity';
import { PasswordResetTokenPersistenceModel } from './password-reset-token.persistence-model';

export function toDomain(model: PasswordResetTokenPersistenceModel): PasswordResetToken {
  return PasswordResetToken.reconstitute({
    id: model.id,
    userId: model.userId,
    tokenHash: model.tokenHash,
    expiresAt: model.expiresAt,
    usedAt: model.usedAt,
  });
}

export function toPersistence(
  entity: PasswordResetToken,
): PasswordResetTokenPersistenceModel {
  const model = new PasswordResetTokenPersistenceModel();
  model.id = entity.id;
  model.userId = entity.userId;
  model.tokenHash = entity.tokenHash;
  model.expiresAt = entity.expiresAt;
  model.usedAt = entity.usedAt;
  return model;
}
