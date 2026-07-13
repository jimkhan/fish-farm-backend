import { Inject, Injectable } from '@nestjs/common';
import { InventoryItem } from '../domain/inventory-item.entity';
import {
  INVENTORY_ITEM_REPOSITORY,
  InventoryItemRepositoryPort,
} from './ports/inventory-item-repository.port';

/** `GET /projects/{projectId}/inventory` (CON-022, AC-078). Any member role — Partner read-only. */
@Injectable()
export class ListInventoryUseCase {
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepositoryPort,
  ) {}

  async execute(): Promise<InventoryItem[]> {
    return this.items.findAllInCurrentProject();
  }
}
