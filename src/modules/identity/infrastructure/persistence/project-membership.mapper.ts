import { ProjectMembership } from '../../domain/project-membership.entity';
import { ProjectMembershipPersistenceModel } from './project-membership.persistence-model';

export function toDomain(model: ProjectMembershipPersistenceModel): ProjectMembership {
  return ProjectMembership.reconstitute({
    id: model.id,
    userId: model.userId,
    projectId: model.projectId,
    role: model.role,
    status: model.status,
    createdAt: model.createdAt,
  });
}

export function toPersistence(entity: ProjectMembership): ProjectMembershipPersistenceModel {
  const model = new ProjectMembershipPersistenceModel();
  model.id = entity.id;
  model.userId = entity.userId;
  model.projectId = entity.projectId;
  model.role = entity.role;
  model.status = entity.status;
  model.createdAt = entity.createdAt;
  return model;
}
