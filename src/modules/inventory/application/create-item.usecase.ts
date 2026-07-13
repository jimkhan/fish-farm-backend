import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import {
  PROJECT_REPOSITORY,
  ProjectRepositoryPort,
} from '../../projects/application/ports/project-repository.port';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { FeedType, InventoryItem } from '../domain/inventory-item.entity';
import {
  INVENTORY_ITEM_REPOSITORY,
  InventoryItemRepositoryPort,
} from './ports/inventory-item-repository.port';

export interface CreateInventoryItemInput {
  readonly name: string;
  readonly feedType?: FeedType;
  readonly unit: string;
  readonly lowStockThreshold?: number;
}

/**
 * `POST /projects/{projectId}/inventory` (CON-023, FT-029, AC-078, R7/R9). Owner-only — the
 * contract's own description names it explicitly ("CON-023 — FR-042. OWNER."), gated by a new
 * `canManageInventory` capability. Starts at `quantity: 0` — `CreateInventoryItem` carries no
 * initial-stock field (contracts/openapi.yaml); the first receipt is a `POST .../transactions`.
 */
@Injectable()
export class CreateInventoryItemUseCase {
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepositoryPort,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    private readonly tenant: TenantContext,
  ) {}

  async execute(input: CreateInventoryItemInput): Promise<InventoryItem> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    if (project.isClosed) {
      throw new ProjectClosedError();
    }
    if (input.lowStockThreshold !== undefined && input.lowStockThreshold < 0) {
      throw new ValidationError('lowStockThreshold cannot be negative.');
    }

    const item = InventoryItem.reconstitute({
      id: randomUUID(),
      projectId: this.tenant.projectId,
      name: input.name,
      feedType: input.feedType ?? null,
      unit: input.unit,
      quantity: 0,
      lowStockThreshold: input.lowStockThreshold ?? null,
      createdAt: new Date(),
    });

    return this.items.save(item);
  }
}
