import { Module, OnModuleInit } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeedingLogged } from '@fish-farm/shared';
import { DomainEventBus } from '../../platform/events/domain-event-bus';
import { idempotentConsumer } from '../../platform/events/idempotent-consumer';
import { EventsModule } from '../../platform/events/events.module';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { AuditModule } from '../../shared-kernel/audit/audit.module';
import { ScopedRepository } from '../../shared-kernel/tenant/scoped-repository';
import { TenantContext } from '../../shared-kernel/tenant/tenant-context';
import { TenantModule } from '../../shared-kernel/tenant/tenant.module';
import { HarvestModule } from '../harvest/harvest.module';
import { GetGrowthUseCase } from './application/get-growth.usecase';
import { GetPondFcrUseCase } from './application/get-pond-fcr.usecase';
import { OnFeedingLoggedHandler } from './application/on-feeding-logged.handler';
import { POND_FEED_ACCUMULATOR_EVENT_REPOSITORY } from './application/ports/pond-feed-accumulator-event-repository.port';
import { POND_FEED_ACCUMULATOR_REPOSITORY } from './application/ports/pond-feed-accumulator-repository.port';
import { SAMPLING_REPOSITORY } from './application/ports/sampling-repository.port';
import { RecordSamplingUseCase } from './application/record-sampling.usecase';
import { PondFeedAccumulatorPersistenceModel } from './infrastructure/persistence/pond-feed-accumulator.persistence-model';
import { SamplingPersistenceModel } from './infrastructure/persistence/sampling.persistence-model';
import { TypeOrmPondFeedAccumulatorEventRepository } from './infrastructure/typeorm-pond-feed-accumulator-event.repository';
import { TypeOrmPondFeedAccumulatorRepository } from './infrastructure/typeorm-pond-feed-accumulator.repository';
import { TypeOrmSamplingRepository } from './infrastructure/typeorm-sampling.repository';
import { FcrController } from './presentation/fcr.controller';
import { SamplingController } from './presentation/sampling.controller';

/**
 * MOD-07's sampling-growth-FCR slice (TASK-029 — sampling record + ADG/SGR; TASK-030 — pond-level
 * FCR + per-batch survival rate, per the module doc's own §4.2 file layout splitting
 * `src/modules/growth/` sub-concerns). `PondsModule`/`ProjectsModule` are `@Global()`, so
 * `BatchRepositoryPort`/`BatchEventRepositoryPort`/`PondRepositoryPort`/`ProjectRepositoryPort`
 * are injectable without an explicit import. `HarvestModule` is **not** `@Global()`, so it's
 * imported explicitly for `HARVEST_REPOSITORY` (FCR's "gain" includes harvested biomass).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SamplingPersistenceModel, PondFeedAccumulatorPersistenceModel]),
    TenantModule,
    AuditModule,
    EventsModule,
    HarvestModule,
  ],
  controllers: [SamplingController, FcrController],
  providers: [
    RecordSamplingUseCase,
    GetGrowthUseCase,
    GetPondFcrUseCase,
    OnFeedingLoggedHandler,
    // Request-scoped: depends on TenantContext (Scope.REQUEST) — same factory shape as
    // TypeOrmProjectMembershipRepository (TASK-010).
    {
      provide: SAMPLING_REPOSITORY,
      useFactory: (
        repository: Repository<SamplingPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmSamplingRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(SamplingPersistenceModel), TenantContext, TransactionContext],
    },
    {
      provide: POND_FEED_ACCUMULATOR_REPOSITORY,
      useFactory: (
        repository: Repository<PondFeedAccumulatorPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) =>
        new TypeOrmPondFeedAccumulatorRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(PondFeedAccumulatorPersistenceModel), TenantContext, TransactionContext],
    },
    {
      provide: POND_FEED_ACCUMULATOR_EVENT_REPOSITORY,
      useClass: TypeOrmPondFeedAccumulatorEventRepository,
    },
  ],
  // RecordSamplingUseCase (TASK-040): SyncModule's MutationDispatcher replays offline sampling
  // mutations through this exact same use-case — same widening pattern as every other cross-
  // module export this session.
  // GetGrowthUseCase (TASK-038): the reporting module's growth export composes per-batch ADG/SGR
  // through this exact use-case. GrowthModule isn't `@Global()`, so ReportingModule also
  // `imports: [GrowthModule]` — the same widening pattern as every other cross-module export.
  exports: [RecordSamplingUseCase, GetGrowthUseCase],
})
export class GrowthModule implements OnModuleInit {
  constructor(
    private readonly events: DomainEventBus,
    private readonly onFeedingLogged: OnFeedingLoggedHandler,
  ) {}

  /**
   * Subscribes the pond-feed-accumulator handler (TASK-030, R3). Wrapped in `idempotentConsumer()`
   * (TASK-006) — an accumulator increment has no natural idempotency of its own, same reasoning
   * as MOD-04's mortality/sampling/harvest handlers.
   */
  onModuleInit(): void {
    this.events.subscribe<FeedingLogged>(
      'FeedingLogged',
      idempotentConsumer((event) => this.onFeedingLogged.handle(event)),
    );
  }
}
