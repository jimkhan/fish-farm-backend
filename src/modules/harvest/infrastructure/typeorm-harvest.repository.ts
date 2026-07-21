import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { Harvest } from '../domain/harvest.entity';
import { HarvestRepositoryPort } from '../application/ports/harvest-repository.port';
import { HarvestPersistenceModel } from './persistence/harvest.persistence-model';
import { toDomain, toPersistence } from './persistence/harvest.mapper';

@Injectable()
export class TypeOrmHarvestRepository implements HarvestRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<HarvestPersistenceModel>) {}

  async findAllInCurrentProject(): Promise<Harvest[]> {
    const models = await this.scoped.find();
    return models.map(toDomain);
  }

  async findByClientMutationId(clientMutationId: string): Promise<Harvest | null> {
    const [model] = await this.scoped.find({ clientMutationId });
    return model ? toDomain(model) : null;
  }

  async save(harvest: Harvest): Promise<Harvest> {
    const saved = await this.scoped.save(toPersistence(harvest));
    return toDomain(saved);
  }
}
