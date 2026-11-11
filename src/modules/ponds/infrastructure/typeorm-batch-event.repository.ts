import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Batch } from '../domain/batch.entity';
import { BatchEventRepositoryPort } from '../application/ports/batch-event-repository.port';
import { toDomain, toPersistence } from './persistence/batch.mapper';
import { BatchPersistenceModel } from './persistence/batch.persistence-model';

/** Unscoped — see `BatchEventRepositoryPort`'s doc comment for why (no `TenantContext` on the event bus). */
@Injectable()
export class TypeOrmBatchEventRepository implements BatchEventRepositoryPort {
  constructor(
    @InjectRepository(BatchPersistenceModel)
    private readonly repository: Repository<BatchPersistenceModel>,
  ) {}

  async findById(batchId: string): Promise<Batch | null> {
    const model = await this.repository.findOne({ where: { id: batchId } });
    return model ? toDomain(model) : null;
  }

  async findWithStockInPond(): Promise<Batch[]> {
    const models = await this.repository.find({ where: { status: In(['ACTIVE', 'HARVESTING']) } });
    return models.map(toDomain);
  }

  async save(batch: Batch): Promise<Batch> {
    const saved = await this.repository.save(toPersistence(batch));
    return toDomain(saved);
  }
}
