import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { FeedCostIncurred, LowStock } from '@fish-farm/shared';
import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import {
  PROJECT_REPOSITORY,
  ProjectRepositoryPort,
} from '../../projects/application/ports/project-repository.port';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { InventoryItem } from '../domain/inventory-item.entity';
import { InventoryTxn } from '../domain/inventory-txn.entity';
import {
  INVENTORY_ITEM_REPOSITORY,
  InventoryItemRepositoryPort,
} from './ports/inventory-item-repository.port';
import {
  INVENTORY_TXN_REPOSITORY,
  InventoryTxnRepositoryPort,
} from './ports/inventory-txn-repository.port';

export interface RecordInventoryTxnInput {
  readonly delta: number;
  readonly reason: string;
  readonly costMinor?: number;
}

/**
 * `POST /projects/{projectId}/inventory/{itemId}/transactions` (CON-024, FT-029/031,
 * AC-079/080/082, R6/R7/R9). Owner-only, same `canManageInventory` gate as item creation — this
 * endpoint is for manual receipts/adjustments (module doc §2.3, "Owner... inventory items +
 * thresholds"); automatic feeding deductions are a separate path TASK-022 adds later (the
 * contract's own description: "Deductions are created automatically by feeding logs"). Unlike
 * TASK-022's feeding-log over-deduction (R5, recorded with a flagged discrepancy, never blocked),
 * a MANUAL adjustment that would drive quantity negative is rejected outright (error table:
 * "Adjustment would make stock invalid"). A receipt (`delta > 0`) carrying a cost also publishes
 * `FeedCostIncurred` (TASK-032, → MOD-08's finance ingestion, R3).
 */
@Injectable()
export class RecordInventoryTxnUseCase {
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepositoryPort,
    @Inject(INVENTORY_TXN_REPOSITORY) private readonly txns: InventoryTxnRepositoryPort,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    private readonly events: DomainEventBus,
    private readonly tenant: TenantContext,
  ) {}

  async execute(itemId: string, input: RecordInventoryTxnInput): Promise<InventoryTxn> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    if (project.isClosed) {
      throw new ProjectClosedError();
    }

    const item = await this.items.findById(itemId);
    if (!item) {
      throw new NotFoundError('Inventory item not found.');
    }

    const quantityBefore = item.quantity;
    const quantityAfter = quantityBefore + input.delta;
    if (quantityAfter < 0) {
      throw new ValidationError('Adjustment would make stock invalid.');
    }

    const txn = InventoryTxn.reconstitute({
      id: randomUUID(),
      projectId: this.tenant.projectId,
      itemId,
      delta: input.delta,
      reason: input.reason,
      costMinor: input.costMinor ?? null,
      occurredAt: new Date(),
    });
    const savedTxn = await this.txns.save(txn);

    await this.items.save(item.applyDelta(input.delta));

    if (InventoryItem.crossesLowStockThreshold(quantityBefore, quantityAfter, item.lowStockThreshold)) {
      const lowStockEvent: LowStock = {
        name: 'LowStock',
        eventId: randomUUID(),
        occurredAt: new Date(),
        projectId: this.tenant.projectId,
        sourceRef: itemId,
        message: `Inventory item "${item.name}" fell below its low-stock threshold.`,
      };
      await this.events.publish(lowStockEvent);
    }

    // R3 (MOD-08): a receipt (delta > 0) carrying a cost auto-ingests as a FEED cost transaction —
    // a plain adjustment/deduction, or a receipt with no cost, has nothing for finance to record.
    if (input.costMinor !== undefined && input.delta > 0) {
      const feedCostEvent: FeedCostIncurred = {
        name: 'FeedCostIncurred',
        eventId: randomUUID(),
        occurredAt: new Date(),
        projectId: this.tenant.projectId,
        sourceRef: savedTxn.id,
        costMinor: input.costMinor,
      };
      await this.events.publish(feedCostEvent);
    }

    return savedTxn;
  }
}
