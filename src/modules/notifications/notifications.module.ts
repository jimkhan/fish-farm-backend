import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  AbnormalMortalityDetected,
  AlertRaised,
  LowStock,
  MissedTask,
  WaterEmergencyRaised,
  WaterThresholdBreached,
} from '@fish-farm/shared';
import { AppEnv } from '../../platform/config/env.validation';
import { DomainEventBus } from '../../platform/events/domain-event-bus';
import { EventsModule } from '../../platform/events/events.module';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { AuditModule } from '../../shared-kernel/audit/audit.module';
import { ScopedRepository } from '../../shared-kernel/tenant/scoped-repository';
import { TenantContext } from '../../shared-kernel/tenant/tenant-context';
import { TenantModule } from '../../shared-kernel/tenant/tenant.module';
import { PORTFOLIO_ALERTS } from '../projects/domain/portfolio-alerts.port';
import { AcknowledgeAlertUseCase } from './application/acknowledge-alert.usecase';
import { DeliveryService } from './application/delivery.service';
import { ListAlertsUseCase } from './application/list-alerts.usecase';
import { OnAbnormalMortalityDetectedHandler } from './application/on-abnormal-mortality-detected.handler';
import { OnAlertRaisedHandler } from './application/on-alert-raised.handler';
import { OnLowStockHandler } from './application/on-low-stock.handler';
import { OnMissedTaskHandler } from './application/on-missed-task.handler';
import { OnWaterEmergencyRaisedHandler } from './application/on-water-emergency-raised.handler';
import { OnWaterThresholdBreachedHandler } from './application/on-water-threshold-breached.handler';
import { ALERT_EVENT_REPOSITORY } from './application/ports/alert-event-repository.port';
import { ALERT_REPOSITORY } from './application/ports/alert-repository.port';
import { DELIVERY_ATTEMPT_REPOSITORY } from './application/ports/delivery-attempt-repository.port';
import { DEVICE_TOKEN_REPOSITORY } from './application/ports/device-token-repository.port';
import { RaiseAlertUseCase } from './application/raise-alert.usecase';
import { RecipientResolver } from './application/recipient-resolver';
import { RegisterDeviceUseCase } from './application/register-device.usecase';
import { SlaEscalationScheduler } from './application/sla-escalation.scheduler';
import { FALLBACK_NOTIFICATION_CHANNEL, NOTIFICATION_CHANNEL } from './domain/notification-channel.port';
import { AlertPersistenceModel } from './infrastructure/persistence/alert.persistence-model';
import { DeliveryAttemptPersistenceModel } from './infrastructure/persistence/delivery-attempt.persistence-model';
import { DeviceTokenPersistenceModel } from './infrastructure/persistence/device-token.persistence-model';
import { FcmAdapter } from './infrastructure/fcm.adapter';
import { PortfolioAlertsAdapter } from './infrastructure/portfolio-alerts.adapter';
import { SmsAdapter } from './infrastructure/sms.adapter.stub';
import { TypeOrmAlertEventRepository } from './infrastructure/typeorm-alert-event.repository';
import { TypeOrmAlertRepository } from './infrastructure/typeorm-alert.repository';
import { TypeOrmDeliveryAttemptRepository } from './infrastructure/typeorm-delivery-attempt.repository';
import { TypeOrmDeviceTokenRepository } from './infrastructure/typeorm-device-token.repository';
import { AlertsController } from './presentation/alerts.controller';
import { DevicesController } from './presentation/devices.controller';

/**
 * MOD-09's alert-engine slice (TASK-015) plus channel/device-registration (TASK-016).
 * `IdentityModule`/`ProjectsModule` are `@Global()`, so `ProjectMembersDirectoryPort` (for
 * `RecipientResolver`) is injectable without an explicit import — MOD-09 depends on MOD-02
 * directly (module doc §1 dependencies).
 *
 * `@Global()` (TASK-012): MOD-03's portfolio use-case needs `PortfolioAlertsPort` — the inverted
 * direction (MOD-09 implements a port MOD-03 declared, since MOD-09 depends on MOD-03 for project
 * context and MOD-03 importing MOD-09 back would recreate that cycle) — mirrors `IdentityModule`/
 * `PondsModule`.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AlertPersistenceModel,
      DeviceTokenPersistenceModel,
      DeliveryAttemptPersistenceModel,
    ]),
    TenantModule,
    AuditModule,
    EventsModule,
  ],
  controllers: [AlertsController, DevicesController],
  providers: [
    ListAlertsUseCase,
    AcknowledgeAlertUseCase,
    RaiseAlertUseCase,
    RecipientResolver,
    RegisterDeviceUseCase,
    OnWaterThresholdBreachedHandler,
    OnWaterEmergencyRaisedHandler,
    OnLowStockHandler,
    OnMissedTaskHandler,
    OnAbnormalMortalityDetectedHandler,
    OnAlertRaisedHandler,
    DeliveryService,
    SlaEscalationScheduler,
    { provide: ALERT_EVENT_REPOSITORY, useClass: TypeOrmAlertEventRepository },
    { provide: PORTFOLIO_ALERTS, useClass: PortfolioAlertsAdapter },
    { provide: DEVICE_TOKEN_REPOSITORY, useClass: TypeOrmDeviceTokenRepository },
    { provide: DELIVERY_ATTEMPT_REPOSITORY, useClass: TypeOrmDeliveryAttemptRepository },
    // FCM is the only *active* channel in MVP (AC-057). SMS is bound as the TASK-017 fallback —
    // still inactive (BACKLOG non-goal: "No SMS fallback until Phase 2"), but `DeliveryService`
    // now genuinely calls it once the primary exhausts retries, exercising the extension seam.
    {
      provide: NOTIFICATION_CHANNEL,
      useFactory: (config: ConfigService<AppEnv, true>) =>
        new FcmAdapter(config.get('FCM_SERVER_KEY', { infer: true })),
      inject: [ConfigService],
    },
    { provide: FALLBACK_NOTIFICATION_CHANNEL, useClass: SmsAdapter },
    // Request-scoped: depends on TenantContext (Scope.REQUEST) — same factory shape as
    // TypeOrmProjectMembershipRepository (TASK-010).
    {
      provide: ALERT_REPOSITORY,
      useFactory: (
        repository: Repository<AlertPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmAlertRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(AlertPersistenceModel), TenantContext, TransactionContext],
    },
  ],
  // ALERT_REPOSITORY (TASK-024): MOD-06's emergency-flow use-case needs it to read back the real
  // alert `RaiseAlertUseCase` just created/uplifted (via the awaited DomainEventBus.publish()
  // chain) so the endpoint can return it — a straightforward MOD-06→MOD-09 forward dependency
  // (module doc §1 lists MOD-09 as a MOD-06 dependency directly), same "@Global() only widens
  // exported tokens" fix as every prior cross-module port-widening this session.
  // NOTIFICATION_CHANNEL/DEVICE_TOKEN_REPOSITORY (TASK-021): MOD-05's `FeedingReminderScheduler`
  // sends a best-effort push directly (not through `DeliveryService`, which is `Alert`-specific)
  // — same widening fix.
  exports: [PORTFOLIO_ALERTS, ALERT_REPOSITORY, NOTIFICATION_CHANNEL, DEVICE_TOKEN_REPOSITORY],
})
export class NotificationsModule implements OnModuleInit {
  constructor(
    private readonly events: DomainEventBus,
    private readonly onWaterThresholdBreached: OnWaterThresholdBreachedHandler,
    private readonly onWaterEmergencyRaised: OnWaterEmergencyRaisedHandler,
    private readonly onLowStock: OnLowStockHandler,
    private readonly onMissedTask: OnMissedTaskHandler,
    private readonly onAbnormalMortalityDetected: OnAbnormalMortalityDetectedHandler,
    private readonly onAlertRaised: OnAlertRaisedHandler,
  ) {}

  /**
   * Subscribes the alert-raising handlers (TASK-015, AC-050) plus the dispatch handler
   * (TASK-016, AC-053) that reacts to this module's own `AlertRaised` (published by
   * `RaiseAlertUseCase` only on a fresh alert, never an uplift — R4's debounce). No
   * `idempotentConsumer()` wrapper on the source-event handlers — `RaiseAlertUseCase` is already
   * durably idempotent by dedup key (a DB lookup, not an in-process set), which is the stronger
   * guarantee TASK-006's helper's own doc comment points durable-idempotency needs to fall back
   * on. `OnAlertRaisedHandler` doesn't need it either — it only reads/dispatches, `RAISED→SENT` is
   * itself a safe no-op past the first successful call (`Alert.transitionTo` is a no-op if the
   * state already matches).
   */
  onModuleInit(): void {
    this.events.subscribe<WaterThresholdBreached>('WaterThresholdBreached', (event) =>
      this.onWaterThresholdBreached.handle(event),
    );
    this.events.subscribe<WaterEmergencyRaised>('WaterEmergencyRaised', (event) =>
      this.onWaterEmergencyRaised.handle(event),
    );
    this.events.subscribe<LowStock>('LowStock', (event) => this.onLowStock.handle(event));
    this.events.subscribe<MissedTask>('MissedTask', (event) => this.onMissedTask.handle(event));
    this.events.subscribe<AbnormalMortalityDetected>('AbnormalMortalityDetected', (event) =>
      this.onAbnormalMortalityDetected.handle(event),
    );
    this.events.subscribe<AlertRaised>('AlertRaised', (event) => this.onAlertRaised.handle(event));
  }
}
