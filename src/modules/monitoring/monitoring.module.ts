import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppEnv } from '../../platform/config/env.validation';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { AuditModule } from '../../shared-kernel/audit/audit.module';
import { ScopedRepository } from '../../shared-kernel/tenant/scoped-repository';
import { TenantContext } from '../../shared-kernel/tenant/tenant-context';
import { TenantModule } from '../../shared-kernel/tenant/tenant.module';
import { GetCameraConfigUseCase } from './application/get-camera-config.usecase';
import { CAMERA_REPOSITORY } from './application/ports/camera-repository.port';
import { GetWeatherUseCase } from './application/get-weather.usecase';
import { RefreshWeatherScheduler } from './application/refresh-weather.scheduler';
import { WEATHER_ADAPTER } from './application/ports/weather-adapter.port';
import { WEATHER_SNAPSHOT_EVENT_REPOSITORY } from './application/ports/weather-snapshot-event-repository.port';
import { WEATHER_SNAPSHOT_REPOSITORY } from './application/ports/weather-snapshot-repository.port';
import { CameraPersistenceModel } from './infrastructure/persistence/camera.persistence-model';
import { WeatherSnapshotPersistenceModel } from './infrastructure/persistence/weather-snapshot.persistence-model';
import { OpenWeatherAdapter } from './infrastructure/openweather.adapter';
import { TypeOrmCameraRepository } from './infrastructure/typeorm-camera.repository';
import { TypeOrmWeatherSnapshotEventRepository } from './infrastructure/typeorm-weather-snapshot-event.repository';
import { TypeOrmWeatherSnapshotRepository } from './infrastructure/typeorm-weather-snapshot.repository';
import { CameraController } from './presentation/camera.controller';
import { WeatherController } from './presentation/weather.controller';

/**
 * MOD-10's camera + weather slices (TASK-035 — camera, read-only; TASK-036 — weather adapter +
 * cache + graceful degradation; daily summary (TASK-037) is a separate sibling task). `ProjectsModule`
 * is `@Global()`, so `PROJECT_REPOSITORY` (`RefreshWeatherScheduler`'s cross-tenant scan) is
 * injectable without an explicit import.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CameraPersistenceModel, WeatherSnapshotPersistenceModel]),
    TenantModule,
    AuditModule,
  ],
  controllers: [CameraController, WeatherController],
  providers: [
    GetCameraConfigUseCase,
    GetWeatherUseCase,
    RefreshWeatherScheduler,
    // Request-scoped: depends on TenantContext (Scope.REQUEST) — same factory shape as
    // TypeOrmProjectMembershipRepository (TASK-010).
    {
      provide: CAMERA_REPOSITORY,
      useFactory: (
        repository: Repository<CameraPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmCameraRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(CameraPersistenceModel), TenantContext, TransactionContext],
    },
    {
      provide: WEATHER_SNAPSHOT_REPOSITORY,
      useFactory: (
        repository: Repository<WeatherSnapshotPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) =>
        new TypeOrmWeatherSnapshotRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(WeatherSnapshotPersistenceModel), TenantContext, TransactionContext],
    },
    { provide: WEATHER_SNAPSHOT_EVENT_REPOSITORY, useClass: TypeOrmWeatherSnapshotEventRepository },
    // Same "credentials via env only, degrade gracefully when unset" shape as FcmAdapter (TASK-016).
    {
      provide: WEATHER_ADAPTER,
      useFactory: (config: ConfigService<AppEnv, true>) =>
        new OpenWeatherAdapter(config.get('OPENWEATHER_API_KEY', { infer: true })),
      inject: [ConfigService],
    },
  ],
})
export class MonitoringModule {}
