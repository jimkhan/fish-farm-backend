import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { Treatment } from '../domain/treatment.entity';
import { TreatmentRepositoryPort } from '../application/ports/treatment-repository.port';
import { TreatmentPersistenceModel } from './persistence/treatment.persistence-model';
import { toDomain, toPersistence } from './persistence/treatment.mapper';

@Injectable()
export class TypeOrmTreatmentRepository implements TreatmentRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<TreatmentPersistenceModel>) {}

  async findAllForBatch(batchId: string): Promise<Treatment[]> {
    const models = await this.scoped.find({ batchId });
    return models.map(toDomain);
  }

  async save(treatment: Treatment): Promise<Treatment> {
    const saved = await this.scoped.save(toPersistence(treatment));
    return toDomain(saved);
  }
}
