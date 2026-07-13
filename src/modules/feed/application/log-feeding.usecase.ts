import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { FeedingLogged, LowStock } from '@fish-farm/shared';
import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { BATCH_REPOSITORY, BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import { SPECIES_REPOSITORY, SpeciesRepositoryPort } from '../../ponds/application/ports/species-repository.port';
import {
  PROJECT_REPOSITORY,
  ProjectRepositoryPort,
} from '../../projects/application/ports/project-repository.port';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { InventoryItem } from '../../inventory/domain/inventory-item.entity';
import { InventoryTxn } from '../../inventory/domain/inventory-txn.entity';
import {
  INVENTORY_ITEM_REPOSITORY,
  InventoryItemRepositoryPort,
} from '../../inventory/application/ports/inventory-item-repository.port';
import {
  INVENTORY_TXN_REPOSITORY,
  InventoryTxnRepositoryPort,
} from '../../inventory/application/ports/inventory-txn-repository.port';
import { feedTypeForSpeciesCategory } from '../domain/feed-type';
import { FeedTypeMismatchError } from '../domain/feed-errors';
import { FeedObservation, FeedingLog } from '../domain/feeding-log.entity';
import {
  FEEDING_LOG_REPOSITORY,
  FeedingLogRepositoryPort,
} from './ports/feeding-log-repository.port';

export interface LogFeedingInput {
  readonly inventoryItemId: string;
  readonly qtyKg: number;
  readonly fedAt: Date;
  readonly observation?: FeedObservation;
  readonly clientMutationId: string;
}

/**
 * `POST /projects/{projectId}/batches/{batchId}/feedings` (CON-018, F5/F6, AC-074/075/077, R4/
 * R5/R9). Gated `canWrite` (module doc §2.3 — Worker mobile logs feedings; Partners are
 * read-only). Deduction + txn + log all persist through the request's ambient transaction
 * (`TransactionContext`, TASK-005) — no manual orchestration needed, same pattern as
 * `RecordStockingUseCase`.
 *
 * R5/edge case 6 — **deliberately no negative-stock guard here**, unlike
 * `RecordInventoryTxnUseCase`'s manual-adjustment path: a feeding is a physical fact that already
 * happened and is always recorded, even when it drives `quantity` negative; the negative value
 * itself is the "flagged discrepancy" — visible on every `GET .../inventory` read, "surfaced for
 * correction, not hidden," with no separate flag field to invent. `POST /sync` (TASK-040) will
 * call this exact same use-case for an offline-logged feeding (AC-076's own scenario), so the
 * behavior is already correct for that path without further changes here (non-goal: proving the
 * `/sync` route itself is TASK-040's, not this task's).
 */
@Injectable()
export class LogFeedingUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    @Inject(BATCH_REPOSITORY) private readonly batches: BatchRepositoryPort,
    @Inject(SPECIES_REPOSITORY) private readonly species: SpeciesRepositoryPort,
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepositoryPort,
    @Inject(INVENTORY_TXN_REPOSITORY) private readonly txns: InventoryTxnRepositoryPort,
    @Inject(FEEDING_LOG_REPOSITORY) private readonly feedingLogs: FeedingLogRepositoryPort,
    private readonly events: DomainEventBus,
    private readonly tenant: TenantContext,
  ) {}

  async execute(batchId: string, input: LogFeedingInput): Promise<FeedingLog> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    if (project.isClosed) {
      throw new ProjectClosedError();
    }
    if (input.qtyKg <= 0) {
      throw new ValidationError('qtyKg must be positive.');
    }

    // Edge case: a batchId from another project resolves to null (ScopedRepository) — never
    // discloses whether it exists elsewhere, same anti-enumeration shape as TASK-028/029.
    const batch = await this.batches.findById(batchId);
    if (!batch) {
      throw new NotFoundError('Batch not found.');
    }

    // ADR-010: idempotent by clientMutationId — a replayed mutation never double-deducts.
    const existing = await this.feedingLogs.findByClientMutationId(input.clientMutationId);
    if (existing) {
      return existing;
    }

    const item = await this.items.findById(input.inventoryItemId);
    if (!item) {
      throw new NotFoundError('Inventory item not found.');
    }

    // R4: a null item.feedType is an unclassified/generic item (e.g. a misc consumable) —
    // unrestricted, never mismatched. A classified item must match the batch's derived feed
    // type (F3, feedTypeForSpeciesCategory — same mapping GetFeedPlanUseCase already uses).
    if (item.feedType !== null) {
      const allSpecies = await this.species.findAll();
      const speciesEntity = allSpecies.find((s) => s.id === batch.speciesId);
      if (!speciesEntity) {
        throw new NotFoundError('Species not found.');
      }
      const expectedFeedType = feedTypeForSpeciesCategory(speciesEntity.category);
      if (item.feedType !== expectedFeedType) {
        throw new FeedTypeMismatchError();
      }
    }

    const quantityBefore = item.quantity;
    const quantityAfter = quantityBefore - input.qtyKg;

    const txn = InventoryTxn.reconstitute({
      id: randomUUID(),
      projectId: this.tenant.projectId,
      itemId: item.id,
      delta: -input.qtyKg,
      reason: 'FEEDING',
      costMinor: null,
      occurredAt: input.fedAt,
    });
    await this.txns.save(txn);
    await this.items.save(item.applyDelta(-input.qtyKg));

    if (InventoryItem.crossesLowStockThreshold(quantityBefore, quantityAfter, item.lowStockThreshold)) {
      const lowStockEvent: LowStock = {
        name: 'LowStock',
        eventId: randomUUID(),
        occurredAt: new Date(),
        projectId: this.tenant.projectId,
        sourceRef: item.id,
        message: `Inventory item "${item.name}" fell below its low-stock threshold.`,
      };
      await this.events.publish(lowStockEvent);
    }

    const feedingLog = FeedingLog.reconstitute({
      id: randomUUID(),
      projectId: this.tenant.projectId,
      batchId,
      inventoryItemId: item.id,
      qtyKg: input.qtyKg,
      observation: input.observation ?? null,
      fedAt: input.fedAt,
      clientMutationId: input.clientMutationId,
      createdAt: new Date(),
    });
    const saved = await this.feedingLogs.save(feedingLog);

    const feedingLoggedEvent: FeedingLogged = {
      name: 'FeedingLogged',
      eventId: randomUUID(),
      occurredAt: new Date(),
      projectId: this.tenant.projectId,
      batchId,
      qtyKg: input.qtyKg,
      fedAt: input.fedAt,
    };
    await this.events.publish(feedingLoggedEvent);

    return saved;
  }
}
