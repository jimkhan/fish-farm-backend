import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { Pond } from '../domain/pond.entity';
import { PondRepositoryPort } from '../application/ports/pond-repository.port';
import { toDomain, toPersistence } from './persistence/pond.mapper';
import { PondPersistenceModel } from './persistence/pond.persistence-model';

@Injectable()
export class TypeOrmPondRepository implements PondRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<PondPersistenceModel>) {}

  async findAllInCurrentProject(): Promise<Pond[]> {
    const models = await this.scoped.find();
    return models.map(toDomain);
  }

  async findById(pondId: string): Promise<Pond | null> {
    const model = await this.scoped.findOneById(pondId);
    return model ? toDomain(model) : null;
  }

  async save(pond: Pond): Promise<Pond> {
    const saved = await this.scoped.save(toPersistence(pond));
    return toDomain(saved);
  }
}
