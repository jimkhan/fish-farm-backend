import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventsModule } from '../../platform/events/events.module';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { AuditModule } from '../../shared-kernel/audit/audit.module';
import { ScopedRepository } from '../../shared-kernel/tenant/scoped-repository';
import { TenantContext } from '../../shared-kernel/tenant/tenant-context';
import { TenantModule } from '../../shared-kernel/tenant/tenant.module';
import { ConfigureThresholdsUseCase } from './application/configure-thresholds.usecase';
import { GetThresholdsUseCase } from './application/get-thresholds.usecase';
import { GetWaterTrendsUseCase } from './application/get-water-trends.usecase';
import { ListReadingsUseCase } from './application/list-readings.usecase';
import { LogPondActionUseCase } from './application/log-pond-action.usecase';
import { POND_ACTION_REPOSITORY } from './application/ports/pond-action-repository.port';
import { WATER_READING_REPOSITORY } from './application/ports/water-reading-repository.port';
import { WATER_THRESHOLD_REPOSITORY } from './application/ports/water-threshold-repository.port';
import { RaiseEmergencyUseCase } from './application/raise-emergency.usecase';
import { RecordReadingUseCase } from './application/record-reading.usecase';
import { PondActionPersistenceModel } from './infrastructure/persistence/pond-action.persistence-model';
import { WaterReadingPersistenceModel } from './infrastructure/persistence/water-reading.persistence-model';
import { WaterThresholdPersistenceModel } from './infrastructure/persistence/water-threshold.persistence-model';
import { TypeOrmPondActionRepository } from './infrastructure/typeorm-pond-action.repository';
import { TypeOrmWaterReadingRepository } from './infrastructure/typeorm-water-reading.repository';
import { TypeOrmWaterThresholdRepository } from './infrastructure/typeorm-water-threshold.repository';
import { WaterEventsController } from './presentation/water-events.controller';
import { WaterReadingsController } from './presentation/water-readings.controller';
import { WaterThresholdsController } from './presentation/water-thresholds.controller';

/**
 * MOD-06's readings/thresholds/emergency/pond-action slice (TASK-023 — manual water readings,
 * configurable thresholds, breach evaluation; TASK-024 — one-tap emergency; TASK-025 —
 * chain-drag/aeration pond-action logs, sync-only, no REST controller — trends and sensor
 * ingestion are separate, later tasks — TASK-026/027). `PondsModule`/`ProjectsModule`/
 * `NotificationsModule` are `@Global()`, so `PondRepositoryPort`/`ProjectRepositoryPort`/
 * `AlertRepositoryPort` are injectable here without an explicit import — straightforward
 * MOD-06→MOD-04/MOD-03/MOD-09 forward dependencies (module doc §1 lists all three directly).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WaterReadingPersistenceModel,
      WaterThresholdPersistenceModel,
      PondActionPersistenceModel,
    ]),
    TenantModule,
    AuditModule,
    EventsModule,
  ],
  controllers: [WaterReadingsController, WaterThresholdsController, WaterEventsController],
  providers: [
    ListReadingsUseCase,
    GetWaterTrendsUseCase,
    RecordReadingUseCase,
    GetThresholdsUseCase,
    ConfigureThresholdsUseCase,
    RaiseEmergencyUseCase,
    LogPondActionUseCase,
    // Request-scoped: depends on TenantContext (Scope.REQUEST) — same factory shape as
    // TypeOrmProjectMembershipRepository (TASK-010).
    {
      provide: WATER_READING_REPOSITORY,
      useFactory: (
        repository: Repository<WaterReadingPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmWaterReadingRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(WaterReadingPersistenceModel), TenantContext, TransactionContext],
    },
    {
      provide: WATER_THRESHOLD_REPOSITORY,
      useFactory: (
        repository: Repository<WaterThresholdPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmWaterThresholdRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(WaterThresholdPersistenceModel), TenantContext, TransactionContext],
    },
    {
      provide: POND_ACTION_REPOSITORY,
      useFactory: (
        repository: Repository<PondActionPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmPondActionRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(PondActionPersistenceModel), TenantContext, TransactionContext],
    },
  ],
  // WATER_READING_REPOSITORY/WATER_THRESHOLD_REPOSITORY (TASK-021): MOD-05's feed module needs
  // both to read the latest DO/TEMP for a batch's pond and its effective thresholds when computing
  // a feed plan (module doc §1 — MOD-05 "consumes... the latest water reading (MOD-06)"). Unlike
  // `PondsModule`/`NotificationsModule`, `WaterModule` isn't `@Global()`, so exporting isn't
  // enough by itself — the consuming module must also `imports: [WaterModule]` explicitly
  // (`FeedModule` does). RecordReadingUseCase/RaiseEmergencyUseCase/LogPondActionUseCase
  // (TASK-040/025): SyncModule's MutationDispatcher replays offline water-reading/emergency/
  // pond-action mutations through these exact same use-cases — same widening pattern.
  exports: [
    WATER_READING_REPOSITORY,
    WATER_THRESHOLD_REPOSITORY,
    RecordReadingUseCase,
    RaiseEmergencyUseCase,
    LogPondActionUseCase,
  ],
})
export class WaterModule {}
