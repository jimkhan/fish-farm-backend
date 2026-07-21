import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventsModule } from '../../platform/events/events.module';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { AuditModule } from '../../shared-kernel/audit/audit.module';
import { ScopedRepository } from '../../shared-kernel/tenant/scoped-repository';
import { TenantContext } from '../../shared-kernel/tenant/tenant-context';
import { TenantModule } from '../../shared-kernel/tenant/tenant.module';
import { InventoryModule } from '../inventory/inventory.module';
import { WaterModule } from '../water/water.module';
import { FeedingReminderScheduler } from './application/feeding-reminder.scheduler';
import { GetFeedPlanUseCase } from './application/get-feed-plan.usecase';
import { LogFeedingUseCase } from './application/log-feeding.usecase';
import { FEEDING_LOG_REPOSITORY } from './application/ports/feeding-log-repository.port';
import { FeedingLogPersistenceModel } from './infrastructure/persistence/feeding-log.persistence-model';
import { TypeOrmFeedingLogRepository } from './infrastructure/typeorm-feeding-log.repository';
import { FeedController } from './presentation/feed.controller';
import { FeedingLogController } from './presentation/feeding-log.controller';

/**
 * MOD-05's F1–F6 slice (TASK-021 — feed quota calculator, temp/DO adjuster, floating/sinking
 * split, feeding reminders; TASK-022 — feeding log + inventory auto-deduction + check-tray).
 * `PondsModule`/`NotificationsModule`/`IdentityModule` are `@Global()`, so
 * `BatchRepositoryPort`/`SpeciesRepositoryPort`/`BatchEventRepositoryPort`/`NotificationChannel`/
 * `DeviceTokenRepositoryPort`/`ProjectMembersDirectoryPort` are all injectable here without an
 * explicit import (module doc §1 dependencies: MOD-04, MOD-09, and MOD-02 via `RecipientResolver`'s
 * own pattern). `WaterModule`/`InventoryModule` are **not** `@Global()`, so both are imported
 * explicitly — `WaterReadingRepositoryPort`/`WaterThresholdRepositoryPort` (MOD-06 dependency,
 * TASK-021) and `InventoryItemRepositoryPort`/`InventoryTxnRepositoryPort` (MOD-05-internal
 * feed→inventory dependency, TASK-022's `LogFeedingUseCase`).
 *
 * First task to give `src/modules/feed/` its own persistence (`feeding_log`) — BW% bands and
 * default reminder times (TASK-021) stay seeded pure-domain constants, but a feeding log is a
 * genuine physical-fact record, so it needs a real table.
 */
@Module({
  imports: [TypeOrmModule.forFeature([FeedingLogPersistenceModel]), TenantModule, AuditModule, EventsModule, WaterModule, InventoryModule],
  controllers: [FeedController, FeedingLogController],
  providers: [
    GetFeedPlanUseCase,
    FeedingReminderScheduler,
    LogFeedingUseCase,
    // Request-scoped: depends on TenantContext (Scope.REQUEST) — same factory shape as
    // TypeOrmProjectMembershipRepository (TASK-010).
    {
      provide: FEEDING_LOG_REPOSITORY,
      useFactory: (
        repository: Repository<FeedingLogPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmFeedingLogRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(FeedingLogPersistenceModel), TenantContext, TransactionContext],
    },
  ],
  // LogFeedingUseCase (TASK-040): SyncModule's MutationDispatcher replays offline feeding
  // mutations through this exact same use-case (R6, "same domain use-cases" as online) — a
  // straightforward MOD-05→MOD-12 forward dependency. `FeedModule` isn't `@Global()`, so
  // `SyncModule` also needs an explicit `imports: [FeedModule]`. FEEDING_LOG_REPOSITORY
  // (TASK-037): the daily-summary composition (MOD-10) reads it directly — the module doc's own
  // "compose from read-models, not domain internals" (§4.5) is satisfied by reusing this
  // already-sanctioned repository port, no new port-inversion layer needed (unlike Portfolio's
  // MOD-03↔MOD-04 case, there's no cyclic dependency here to solve).
  exports: [LogFeedingUseCase, FEEDING_LOG_REPOSITORY],
})
export class FeedModule {}
