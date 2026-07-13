import { Species } from '../../domain/species.entity';
import { SpeciesPersistenceModel } from './species.persistence-model';

export function toDomain(model: SpeciesPersistenceModel): Species {
  return Species.reconstitute({
    id: model.id,
    name: model.name,
    category: model.category,
    defaultDensityMin: model.defaultDensityMin,
    defaultDensityMax: model.defaultDensityMax,
  });
}
