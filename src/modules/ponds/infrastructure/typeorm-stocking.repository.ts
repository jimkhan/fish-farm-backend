import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { Stocking } from '../domain/stocking.entity';
import { StockingRepositoryPort } from '../application/ports/stocking-repository.port';
import { toDomain, toPersistence } from './persistence/stocking.mapper';
import { StockingPersistenceModel } from './persistence/stocking.persistence-model';

@Injectable()
export class TypeOrmStockingRepository implements StockingRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<StockingPersistenceModel>) {}

  async save(stocking: Stocking): Promise<Stocking> {
    const saved = await this.scoped.save(toPersistence(stocking));
    return toDomain(saved);
  }
}
