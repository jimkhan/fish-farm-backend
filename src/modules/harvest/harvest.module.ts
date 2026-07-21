import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventsModule } from '../../platform/events/events.module';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { AuditModule } from '../../shared-kernel/audit/audit.module';
import { ScopedRepository } from '../../shared-kernel/tenant/scoped-repository';
import { TenantContext } from '../../shared-kernel/tenant/tenant-context';
import { TenantModule } from '../../shared-kernel/tenant/tenant.module';
import { MortalityHealthModule } from '../health/health.module';
import { RecordHarvestUseCase } from './application/record-harvest.usecase';
import { HARVEST_REPOSITORY } from './application/ports/harvest-repository.port';
import { HarvestPersistenceModel } from './infrastructure/persistence/harvest.persistence-model';
import { TypeOrmHarvestRepository } from './infrastructure/typeorm-harvest.repository';
import { HarvestController } from './presentation/harvest.controller';

/**
 * MOD-07's harvest slice (TASK-031 — partial harvest, F7; harvest-to-date vs projected, F8/
 * AC-104, is deferred — FEATURE_LIST.md marks its owning feature FT-045 as **web**-surface, and
 * `contracts/openapi.yaml`'s own reserved registry still lists its read endpoint as unactivated
 * `CON-053`, "when their UI is detailed" — activating it now would invent contract surface the
 * module doc explicitly deferred; a documented, resolved scope finding, not an omission). Mortality/
 * treatments (TASK-028) and sampling/growth (TASK-029) are separate sibling modules, per the
 * module doc's own §4.2 file layout. `PondsModule`/`ProjectsModule` are `@Global()`, so
 * `BatchRepositoryPort`/`ProjectRepositoryPort` are injectable here without an explicit import — a
 * straightforward MOD-07→MOD-04/MOD-03 forward dependency. `MortalityHealthModule` is **not**
 * `@Global()`, so it's imported explicitly for `TreatmentRepositoryPort` (R7's withdrawal-advisory
 * check). `HARVEST_REPOSITORY` (TASK-030): `GrowthModule`'s pond-level FCR query needs harvested
 * biomass per batch (FCR's "gain" includes what's already been harvested) — `HarvestModule` isn't
 * `@Global()`, so exporting isn't enough by itself; the consumer must also `imports:
 * [HarvestModule]` explicitly (`GrowthModule` does).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([HarvestPersistenceModel]),
    TenantModule,
    AuditModule,
    EventsModule,
    MortalityHealthModule,
  ],
  controllers: [HarvestController],
  providers: [
    RecordHarvestUseCase,
    // Request-scoped: depends on TenantContext (Scope.REQUEST) — same factory shape as
    // TypeOrmProjectMembershipRepository (TASK-010).
    {
      provide: HARVEST_REPOSITORY,
      useFactory: (
        repository: Repository<HarvestPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmHarvestRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(HarvestPersistenceModel), TenantContext, TransactionContext],
    },
  ],
  exports: [HARVEST_REPOSITORY],
})
export class HarvestModule {}
