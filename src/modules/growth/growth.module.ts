import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventsModule } from '../../platform/events/events.module';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { AuditModule } from '../../shared-kernel/audit/audit.module';
import { ScopedRepository } from '../../shared-kernel/tenant/scoped-repository';
import { TenantContext } from '../../shared-kernel/tenant/tenant-context';
import { TenantModule } from '../../shared-kernel/tenant/tenant.module';
import { GetGrowthUseCase } from './application/get-growth.usecase';
import { SAMPLING_REPOSITORY } from './application/ports/sampling-repository.port';
import { RecordSamplingUseCase } from './application/record-sampling.usecase';
import { SamplingPersistenceModel } from './infrastructure/persistence/sampling.persistence-model';
import { TypeOrmSamplingRepository } from './infrastructure/typeorm-sampling.repository';
import { SamplingController } from './presentation/sampling.controller';

/**
 * MOD-07's sampling-growth slice (TASK-029 — sampling record + ADG/SGR; FCR and survival-rate
 * queries are TASK-030's, per the module doc's own §4.2 file layout splitting `src/modules/
 * growth/` sub-concerns). `PondsModule`/`ProjectsModule` are `@Global()`, so
 * `BatchRepositoryPort`/`ProjectRepositoryPort` are injectable without an explicit import — a
 * straightforward MOD-07→MOD-04/MOD-03 forward dependency (module doc §1), same shape as
 * TASK-028's `HealthModule`/`MortalityHealthModule`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SamplingPersistenceModel]),
    TenantModule,
    AuditModule,
    EventsModule,
  ],
  controllers: [SamplingController],
  providers: [
    RecordSamplingUseCase,
    GetGrowthUseCase,
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
  ],
})
export class GrowthModule {}
