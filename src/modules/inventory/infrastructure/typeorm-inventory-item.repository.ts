import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { InventoryItem } from '../domain/inventory-item.entity';
import { InventoryItemRepositoryPort } from '../application/ports/inventory-item-repository.port';
import { InventoryItemPersistenceModel } from './persistence/inventory-item.persistence-model';
import { toDomain, toPersistence } from './persistence/inventory-item.mapper';

@Injectable()
export class TypeOrmInventoryItemRepository implements InventoryItemRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<InventoryItemPersistenceModel>) {}

  async findAllInCurrentProject(): Promise<InventoryItem[]> {
    const models = await this.scoped.find();
    return models.map(toDomain);
  }

  async findById(itemId: string): Promise<InventoryItem | null> {
    const model = await this.scoped.findOneById(itemId);
    return model ? toDomain(model) : null;
  }

  async save(item: InventoryItem): Promise<InventoryItem> {
    const saved = await this.scoped.save(toPersistence(item));
    return toDomain(saved);
  }
}
