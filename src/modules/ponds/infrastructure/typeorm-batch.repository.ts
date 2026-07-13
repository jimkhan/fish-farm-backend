import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { Batch } from '../domain/batch.entity';
import { BatchRepositoryPort } from '../application/ports/batch-repository.port';
import { toDomain, toPersistence } from './persistence/batch.mapper';
import { BatchPersistenceModel } from './persistence/batch.persistence-model';

@Injectable()
export class TypeOrmBatchRepository implements BatchRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<BatchPersistenceModel>) {}

  async findAllInCurrentProject(): Promise<Batch[]> {
    const models = await this.scoped.find();
    return models.map(toDomain);
  }

  async findById(batchId: string): Promise<Batch | null> {
    const model = await this.scoped.findOneById(batchId);
    return model ? toDomain(model) : null;
  }

  async save(batch: Batch): Promise<Batch> {
    const saved = await this.scoped.save(toPersistence(batch));
    return toDomain(saved);
  }
}
