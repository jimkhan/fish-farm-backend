import { User } from '../../domain/user.entity';
import { UserPersistenceModel } from './user.persistence-model';

export function toDomain(model: UserPersistenceModel): User {
  return User.reconstitute({
    id: model.id,
    email: model.email,
    name: model.name,
    passwordHash: model.passwordHash,
    status: model.status,
    createdAt: model.createdAt,
  });
}
