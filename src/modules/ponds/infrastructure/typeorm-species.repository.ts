import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Species } from '../domain/species.entity';
import { SpeciesRepositoryPort } from '../application/ports/species-repository.port';
import { toDomain } from './persistence/species.mapper';
import { SpeciesPersistenceModel } from './persistence/species.persistence-model';

@Injectable()
export class TypeOrmSpeciesRepository implements SpeciesRepositoryPort {
  constructor(
    @InjectRepository(SpeciesPersistenceModel)
    private readonly repository: Repository<SpeciesPersistenceModel>,
  ) {}

  async findAll(): Promise<Species[]> {
    const models = await this.repository.find({ order: { name: 'ASC' } });
    return models.map(toDomain);
  }
}
