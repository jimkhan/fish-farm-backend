import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventsModule } from '../../platform/events/events.module';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { AuditModule } from '../../shared-kernel/audit/audit.module';
import { ScopedRepository } from '../../shared-kernel/tenant/scoped-repository';
import { TenantContext } from '../../shared-kernel/tenant/tenant-context';
import { TenantModule } from '../../shared-kernel/tenant/tenant.module';
import { LogMortalityUseCase } from './application/log-mortality.usecase';
import { MORTALITY_REPOSITORY } from './application/ports/mortality-repository.port';
import { TREATMENT_REPOSITORY } from './application/ports/treatment-repository.port';
import { RecordTreatmentUseCase } from './application/record-treatment.usecase';
import { MortalityPersistenceModel } from './infrastructure/persistence/mortality.persistence-model';
import { TreatmentPersistenceModel } from './infrastructure/persistence/treatment.persistence-model';
import { TypeOrmMortalityRepository } from './infrastructure/typeorm-mortality.repository';
import { TypeOrmTreatmentRepository } from './infrastructure/typeorm-treatment.repository';
import { MortalityController } from './presentation/mortality.controller';
import { TreatmentController } from './presentation/treatment.controller';

/**
 * MOD-07's mortality-health slice (TASK-028 — mortality logging, spike detection, treatments;
 * sampling/growth and harvest are separate modules, TASK-029/031, per the module doc's own §4.2
 * file layout). `PondsModule`/`ProjectsModule` are `@Global()`, so `BatchRepositoryPort`/
 * `ProjectRepositoryPort` are injectable here without an explicit import — a straightforward
 * MOD-07→MOD-04/MOD-03 forward dependency (module doc §1).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MortalityPersistenceModel, TreatmentPersistenceModel]),
    TenantModule,
    AuditModule,
    EventsModule,
  ],
  controllers: [MortalityController, TreatmentController],
  providers: [
    LogMortalityUseCase,
    RecordTreatmentUseCase,
    // Request-scoped: depends on TenantContext (Scope.REQUEST) — same factory shape as
    // TypeOrmProjectMembershipRepository (TASK-010).
    {
      provide: MORTALITY_REPOSITORY,
      useFactory: (
        repository: Repository<MortalityPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmMortalityRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(MortalityPersistenceModel), TenantContext, TransactionContext],
    },
    {
      provide: TREATMENT_REPOSITORY,
      useFactory: (
        repository: Repository<TreatmentPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmTreatmentRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(TreatmentPersistenceModel), TenantContext, TransactionContext],
    },
  ],
  // LogMortalityUseCase (TASK-040): SyncModule's MutationDispatcher replays offline mortality
  // mutations through this exact same use-case — same MOD-07→MOD-12 forward dependency shape as
  // FeedModule's LogFeedingUseCase export. TREATMENT_REPOSITORY (TASK-031): HarvestModule needs
  // it to check R7's withdrawal-window advisory (`Treatment.coversDate()`) — a straightforward
  // MOD-07-internal harvest→treatment dependency, same widening pattern. MORTALITY_REPOSITORY
  // (TASK-037): the daily-summary composition (MOD-10) reads it directly for the day's mortality
  // count — same "reuse the existing repository port, no new port-inversion layer" reasoning as
  // FeedModule's FEEDING_LOG_REPOSITORY export.
  exports: [LogMortalityUseCase, TREATMENT_REPOSITORY, MORTALITY_REPOSITORY],
})
// Named `MortalityHealthModule`, not `HealthModule` — `./platform/health/health.module.ts`
// already owns that name for the unrelated `/health` liveness endpoint (TASK-001).
export class MortalityHealthModule {}
