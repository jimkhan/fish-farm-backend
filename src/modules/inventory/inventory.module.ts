import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventsModule } from '../../platform/events/events.module';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { AuditModule } from '../../shared-kernel/audit/audit.module';
import { ScopedRepository } from '../../shared-kernel/tenant/scoped-repository';
import { TenantContext } from '../../shared-kernel/tenant/tenant-context';
import { TenantModule } from '../../shared-kernel/tenant/tenant.module';
import { CreateInventoryItemUseCase } from './application/create-item.usecase';
import { ListInventoryUseCase } from './application/list-inventory.usecase';
import { INVENTORY_ITEM_REPOSITORY } from './application/ports/inventory-item-repository.port';
import { INVENTORY_TXN_REPOSITORY } from './application/ports/inventory-txn-repository.port';
import { ReconcileInventoryUseCase } from './application/reconcile-inventory.usecase';
import { RecordInventoryTxnUseCase } from './application/record-txn.usecase';
import { InventoryItemPersistenceModel } from './infrastructure/persistence/inventory-item.persistence-model';
import { InventoryTxnPersistenceModel } from './infrastructure/persistence/inventory-txn.persistence-model';
import { TypeOrmInventoryItemRepository } from './infrastructure/typeorm-inventory-item.repository';
import { TypeOrmInventoryTxnRepository } from './infrastructure/typeorm-inventory-txn.repository';
import { InventoryController } from './presentation/inventory.controller';
import { InventoryTxnController } from './presentation/inventory-txn.controller';

/**
 * MOD-05's inventory slice (TASK-020 — items, transactions, low-stock alerts, reconciliation;
 * feed quota/schedules and feeding-log auto-deduction are separate, later tasks — TASK-021/022 —
 * per the module doc's own §4.2 file layout splitting `src/modules/feed/` from
 * `src/modules/inventory/`). `ProjectsModule` is `@Global()`, so `ProjectRepositoryPort` is
 * injectable here without an explicit import — a straightforward MOD-05→MOD-03 dependency.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryItemPersistenceModel, InventoryTxnPersistenceModel]),
    TenantModule,
    AuditModule,
    EventsModule,
  ],
  controllers: [InventoryController, InventoryTxnController],
  providers: [
    ListInventoryUseCase,
    CreateInventoryItemUseCase,
    RecordInventoryTxnUseCase,
    ReconcileInventoryUseCase,
    // Request-scoped: depends on TenantContext (Scope.REQUEST) — same factory shape as
    // TypeOrmProjectMembershipRepository (TASK-010).
    {
      provide: INVENTORY_ITEM_REPOSITORY,
      useFactory: (
        repository: Repository<InventoryItemPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmInventoryItemRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(InventoryItemPersistenceModel), TenantContext, TransactionContext],
    },
    {
      provide: INVENTORY_TXN_REPOSITORY,
      useFactory: (
        repository: Repository<InventoryTxnPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmInventoryTxnRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(InventoryTxnPersistenceModel), TenantContext, TransactionContext],
    },
  ],
  // INVENTORY_ITEM_REPOSITORY/INVENTORY_TXN_REPOSITORY (TASK-022): `FeedModule`'s
  // `LogFeedingUseCase` needs both to atomically deduct the matching item and record the
  // deduction as a transaction (F5, R4/R5) — a straightforward MOD-05-internal
  // feed→inventory dependency. `InventoryModule` isn't `@Global()`, so `FeedModule` also needs an
  // explicit `imports: [InventoryModule]` (same shape as its existing `WaterModule` import).
  exports: [INVENTORY_ITEM_REPOSITORY, INVENTORY_TXN_REPOSITORY],
})
export class InventoryModule {}
