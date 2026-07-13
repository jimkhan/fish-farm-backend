import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { InventoryTxn } from '../domain/inventory-txn.entity';
import { InventoryTxnRepositoryPort } from '../application/ports/inventory-txn-repository.port';
import { InventoryTxnPersistenceModel } from './persistence/inventory-txn.persistence-model';
import { toDomain, toPersistence } from './persistence/inventory-txn.mapper';

@Injectable()
export class TypeOrmInventoryTxnRepository implements InventoryTxnRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<InventoryTxnPersistenceModel>) {}

  async findAllForItem(itemId: string): Promise<InventoryTxn[]> {
    const models = await this.scoped.find({ itemId });
    return models.map(toDomain);
  }

  async save(txn: InventoryTxn): Promise<InventoryTxn> {
    const saved = await this.scoped.save(toPersistence(txn));
    return toDomain(saved);
  }
}
