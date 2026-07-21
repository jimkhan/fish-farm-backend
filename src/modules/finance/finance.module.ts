import { Global, Module, OnModuleInit } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { FeedCostIncurred, HarvestRevenueEarned, StockingRecorded } from '@fish-farm/shared';
import { DomainEventBus } from '../../platform/events/domain-event-bus';
import { EventsModule } from '../../platform/events/events.module';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { AuditModule } from '../../shared-kernel/audit/audit.module';
import { ScopedRepository } from '../../shared-kernel/tenant/scoped-repository';
import { TenantContext } from '../../shared-kernel/tenant/tenant-context';
import { TenantModule } from '../../shared-kernel/tenant/tenant.module';
import { PORTFOLIO_FINANCE } from '../projects/domain/portfolio-finance.port';
import { GetFinanceSummaryUseCase } from './application/get-finance-summary.usecase';
import { ListFinancialTxnsUseCase } from './application/list-financial-txns.usecase';
import { OnFeedCostIncurredHandler } from './application/on-feed-cost-incurred.handler';
import { OnHarvestRevenueEarnedHandler } from './application/on-harvest-revenue-earned.handler';
import { OnStockingRecordedHandler } from './application/on-stocking-recorded.handler';
import { FINANCIAL_TXN_EVENT_REPOSITORY } from './application/ports/financial-txn-event-repository.port';
import { FINANCIAL_TXN_REPOSITORY } from './application/ports/financial-txn-repository.port';
import { RecordFinancialTxnUseCase } from './application/record-financial-txn.usecase';
import { FinancialTxnPersistenceModel } from './infrastructure/persistence/financial-txn.persistence-model';
import { PortfolioFinanceAdapter } from './infrastructure/portfolio-finance.adapter';
import { TypeOrmFinancialTxnEventRepository } from './infrastructure/typeorm-financial-txn-event.repository';
import { TypeOrmFinancialTxnRepository } from './infrastructure/typeorm-financial-txn.repository';
import { FinanceController } from './presentation/finance.controller';
import { FinanceSummaryController } from './presentation/finance-summary.controller';

/**
 * MOD-08's finance slice (TASK-032 — F1/F4 costs/revenue/role-gate; TASK-033 — F2/F3 remaining
 * harvest value, net profit, projected ROI, and the portfolio roll-up). `ProjectsModule` is
 * `@Global()`, so `ProjectRepositoryPort` is injectable without an explicit import — a
 * straightforward MOD-08→MOD-03 forward dependency. `PondsModule` is also `@Global()`, so
 * `BatchRepositoryPort`/`SpeciesRepositoryPort` (remaining biomass by species, TASK-033) are
 * injectable the same way. Reuses MOD-02's `RolesGuard`/`rolesWithCapability()` for the role gate
 * rather than re-encoding "Worker no finance / Partner read-only" here (module doc §6.2, avoids
 * policy drift).
 *
 * `@Global()` (TASK-033): MOD-03's portfolio roll-up needs `PortfolioFinancePort` — the inverted
 * direction (MOD-08 implements a port MOD-03 declared, since MOD-08 depends on MOD-03 for project
 * context and MOD-03 importing MOD-08 back would recreate that cycle) — mirrors `PondsModule`/
 * `NotificationsModule`'s own `PortfolioBiomassPort`/`PortfolioAlertsPort` bindings (TASK-012).
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([FinancialTxnPersistenceModel]), TenantModule, AuditModule, EventsModule],
  controllers: [FinanceController, FinanceSummaryController],
  providers: [
    ListFinancialTxnsUseCase,
    RecordFinancialTxnUseCase,
    GetFinanceSummaryUseCase,
    OnStockingRecordedHandler,
    OnFeedCostIncurredHandler,
    OnHarvestRevenueEarnedHandler,
    { provide: FINANCIAL_TXN_EVENT_REPOSITORY, useClass: TypeOrmFinancialTxnEventRepository },
    { provide: PORTFOLIO_FINANCE, useClass: PortfolioFinanceAdapter },
    // Request-scoped: depends on TenantContext (Scope.REQUEST) — same factory shape as
    // TypeOrmProjectMembershipRepository (TASK-010).
    {
      provide: FINANCIAL_TXN_REPOSITORY,
      useFactory: (
        repository: Repository<FinancialTxnPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmFinancialTxnRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(FinancialTxnPersistenceModel), TenantContext, TransactionContext],
    },
  ],
  // FINANCIAL_TXN_REPOSITORY + GetFinanceSummaryUseCase (TASK-038): the reporting module's
  // financial export composes both (the transaction ledger + the computed totals). FinanceModule
  // is `@Global()`, so exporting is sufficient — no explicit import in ReportingModule needed.
  exports: [PORTFOLIO_FINANCE, FINANCIAL_TXN_REPOSITORY, GetFinanceSummaryUseCase],
})
export class FinanceModule implements OnModuleInit {
  constructor(
    private readonly events: DomainEventBus,
    private readonly onStockingRecorded: OnStockingRecordedHandler,
    private readonly onFeedCostIncurred: OnFeedCostIncurredHandler,
    private readonly onHarvestRevenueEarned: OnHarvestRevenueEarnedHandler,
  ) {}

  /**
   * Subscribes the three auto-ingestion handlers (R3, AC-108/109/117). No `idempotentConsumer()`
   * wrapper — each handler is already durably idempotent by `source_ref` (a DB lookup), the
   * stronger guarantee TASK-006's own helper doc comment points durable-idempotency needs to fall
   * back on (same reasoning `NotificationsModule.onModuleInit()` uses for its source-event
   * handlers).
   */
  onModuleInit(): void {
    this.events.subscribe<StockingRecorded>('StockingRecorded', (event) =>
      this.onStockingRecorded.handle(event),
    );
    this.events.subscribe<FeedCostIncurred>('FeedCostIncurred', (event) =>
      this.onFeedCostIncurred.handle(event),
    );
    this.events.subscribe<HarvestRevenueEarned>('HarvestRevenueEarned', (event) =>
      this.onHarvestRevenueEarned.handle(event),
    );
  }
}
