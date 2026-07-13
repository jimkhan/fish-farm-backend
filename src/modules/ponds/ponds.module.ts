import { Global, Module, OnModuleInit } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { HarvestRecorded, MortalityRecorded, SamplingRecorded } from '@fish-farm/shared';
import { AuditModule } from '../../shared-kernel/audit/audit.module';
import { DomainEventBus } from '../../platform/events/domain-event-bus';
import { EventsModule } from '../../platform/events/events.module';
import { idempotentConsumer } from '../../platform/events/idempotent-consumer';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { ScopedRepository } from '../../shared-kernel/tenant/scoped-repository';
import { TenantContext } from '../../shared-kernel/tenant/tenant-context';
import { TenantModule } from '../../shared-kernel/tenant/tenant.module';
import { PORTFOLIO_BIOMASS } from '../projects/domain/portfolio-biomass.port';
import { PROVISION_FIRST_POND } from '../projects/domain/provision-first-pond.port';
import { BiomassOverviewUseCase } from './application/biomass-overview.usecase';
import { CreatePondUseCase } from './application/create-pond.usecase';
import { GetBatchUseCase } from './application/get-batch.usecase';
import { ListBatchesUseCase } from './application/list-batches.usecase';
import { ListPondsUseCase } from './application/list-ponds.usecase';
import { ListSpeciesUseCase } from './application/list-species.usecase';
import { OnHarvestHandler } from './application/on-harvest.handler';
import { OnMortalityHandler } from './application/on-mortality.handler';
import { OnSamplingHandler } from './application/on-sampling.handler';
import { BATCH_EVENT_REPOSITORY } from './application/ports/batch-event-repository.port';
import { BATCH_REPOSITORY } from './application/ports/batch-repository.port';
import { POND_REPOSITORY } from './application/ports/pond-repository.port';
import { SPECIES_REPOSITORY } from './application/ports/species-repository.port';
import { STOCKING_REPOSITORY } from './application/ports/stocking-repository.port';
import { RecordStockingUseCase } from './application/record-stocking.usecase';
import { BatchPersistenceModel } from './infrastructure/persistence/batch.persistence-model';
import { PondPersistenceModel } from './infrastructure/persistence/pond.persistence-model';
import { SpeciesPersistenceModel } from './infrastructure/persistence/species.persistence-model';
import { StockingPersistenceModel } from './infrastructure/persistence/stocking.persistence-model';
import { PortfolioBiomassAdapter } from './infrastructure/portfolio-biomass.adapter';
import { ProvisionFirstPondAdapter } from './infrastructure/provision-first-pond.adapter';
import { TypeOrmBatchEventRepository } from './infrastructure/typeorm-batch-event.repository';
import { TypeOrmBatchRepository } from './infrastructure/typeorm-batch.repository';
import { TypeOrmPondRepository } from './infrastructure/typeorm-pond.repository';
import { TypeOrmSpeciesRepository } from './infrastructure/typeorm-species.repository';
import { TypeOrmStockingRepository } from './infrastructure/typeorm-stocking.repository';
import { BatchesController } from './presentation/batches.controller';
import { BiomassController } from './presentation/biomass.controller';
import { PondsController } from './presentation/ponds.controller';
import { SpeciesController } from './presentation/species.controller';
import { StockingController } from './presentation/stocking.controller';

/**
 * MOD-04's pond/stocking/batch/biomass/species slice (TASK-018/019). `ProjectsModule` is
 * `@Global()`, so `ProjectRepositoryPort` is injectable here without an explicit import — a
 * straightforward MOD-04→MOD-03 dependency (a pond belongs to a project).
 *
 * `@Global()` here too: `CreateProjectUseCase` (MOD-03) needs `ProvisionFirstPondPort` — the
 * inverted direction (MOD-04 implements a port MOD-03 declared) — mirroring `IdentityModule`.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PondPersistenceModel,
      SpeciesPersistenceModel,
      StockingPersistenceModel,
      BatchPersistenceModel,
    ]),
    TenantModule,
    AuditModule,
    EventsModule,
  ],
  controllers: [PondsController, SpeciesController, StockingController, BatchesController, BiomassController],
  providers: [
    ListPondsUseCase,
    CreatePondUseCase,
    ListSpeciesUseCase,
    RecordStockingUseCase,
    ListBatchesUseCase,
    GetBatchUseCase,
    BiomassOverviewUseCase,
    OnMortalityHandler,
    OnSamplingHandler,
    OnHarvestHandler,
    { provide: SPECIES_REPOSITORY, useClass: TypeOrmSpeciesRepository },
    { provide: PROVISION_FIRST_POND, useClass: ProvisionFirstPondAdapter },
    { provide: PORTFOLIO_BIOMASS, useClass: PortfolioBiomassAdapter },
    { provide: BATCH_EVENT_REPOSITORY, useClass: TypeOrmBatchEventRepository },
    // Request-scoped: depends on TenantContext (Scope.REQUEST) — same factory shape as
    // TypeOrmProjectMembershipRepository (TASK-010).
    {
      provide: POND_REPOSITORY,
      useFactory: (
        repository: Repository<PondPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmPondRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(PondPersistenceModel), TenantContext, TransactionContext],
    },
    {
      provide: STOCKING_REPOSITORY,
      useFactory: (
        repository: Repository<StockingPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmStockingRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(StockingPersistenceModel), TenantContext, TransactionContext],
    },
    {
      provide: BATCH_REPOSITORY,
      useFactory: (
        repository: Repository<BatchPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmBatchRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(BatchPersistenceModel), TenantContext, TransactionContext],
    },
  ],
  // BATCH_REPOSITORY (TASK-028): MOD-07's health module needs it to validate a batch belongs to
  // the caller's project before logging a mortality/treatment — a straightforward MOD-07→MOD-04
  // forward dependency (ponds doesn't depend on health back), so no port inversion is needed,
  // just widening this already-`@Global()` module's export list (same fix as TASK-011's
  // MEMBERSHIP_DIRECTORY gap). POND_REPOSITORY (TASK-023): MOD-06's water module needs it to
  // validate a pond belongs to the caller's project before recording a reading — same pattern.
  // BATCH_EVENT_REPOSITORY/SPECIES_REPOSITORY (TASK-021): MOD-05's feed module needs the unscoped
  // batch query for `FeedingReminderScheduler` (runs on a timer, no `TenantContext`) and the
  // species lookup for both the feed-plan query and the reminder scheduler — same widening fix.
  exports: [
    PROVISION_FIRST_POND,
    PORTFOLIO_BIOMASS,
    BATCH_REPOSITORY,
    POND_REPOSITORY,
    BATCH_EVENT_REPOSITORY,
    SPECIES_REPOSITORY,
  ],
})
export class PondsModule implements OnModuleInit {
  constructor(
    private readonly events: DomainEventBus,
    private readonly onMortality: OnMortalityHandler,
    private readonly onSampling: OnSamplingHandler,
    private readonly onHarvest: OnHarvestHandler,
  ) {}

  /**
   * Subscribes the survival/biomass read-model handlers (TASK-019, AC-063/064/066/067).
   * `MortalityRecorded`/`SamplingRecorded`/`HarvestRecorded` have no publisher yet (MOD-07 isn't
   * built) — subscribing now means MOD-04 reacts correctly the moment MOD-07 ships, with nothing
   * to change on this side. Each handler is wrapped in `idempotentConsumer()` (TASK-006) so a
   * redelivered event (at-least-once bus) is applied at most once per process (AC-064).
   */
  onModuleInit(): void {
    this.events.subscribe<MortalityRecorded>(
      'MortalityRecorded',
      idempotentConsumer((event) => this.onMortality.handle(event)),
    );
    this.events.subscribe<SamplingRecorded>(
      'SamplingRecorded',
      idempotentConsumer((event) => this.onSampling.handle(event)),
    );
    this.events.subscribe<HarvestRecorded>(
      'HarvestRecorded',
      idempotentConsumer((event) => this.onHarvest.handle(event)),
    );
  }
}
