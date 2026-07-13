import { Project } from '../../domain/project.entity';
import { ProjectPersistenceModel } from './project.persistence-model';

export function toDomain(model: ProjectPersistenceModel): Project {
  return Project.reconstitute({
    id: model.id,
    name: model.name,
    siteLat: model.siteLat,
    siteLng: model.siteLng,
    address: model.address,
    currency: model.currency,
    landUnit: model.landUnit,
    status: model.status,
    createdAt: model.createdAt,
  });
}

export function toPersistence(entity: Project): ProjectPersistenceModel {
  const model = new ProjectPersistenceModel();
  model.id = entity.id;
  model.name = entity.name;
  model.siteLat = entity.siteLat;
  model.siteLng = entity.siteLng;
  model.address = entity.address;
  model.currency = entity.currency;
  model.landUnit = entity.landUnit;
  model.status = entity.status;
  model.createdAt = entity.createdAt;
  return model;
}
