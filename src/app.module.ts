import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CalendarModule } from './platform/calendar/calendar.module';
import { ConfigModule } from './platform/config/config.module';
import { EventsModule } from './platform/events/events.module';
import { HealthModule } from './platform/health/health.module';
import { PersistenceModule } from './platform/persistence/persistence.module';
import { TransactionModule } from './platform/persistence/transaction.module';
import { AuditModule } from './shared-kernel/audit/audit.module';
import { ErrorsModule } from './shared-kernel/errors/errors.module';
import { TenantModule } from './shared-kernel/tenant/tenant.module';
import { FeedModule } from './modules/feed/feed.module';
import { FinanceModule } from './modules/finance/finance.module';
import { GrowthModule } from './modules/growth/growth.module';
import { HarvestModule } from './modules/harvest/harvest.module';
import { IdentityModule } from './modules/identity/identity.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { MortalityHealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PondsModule } from './modules/ponds/ponds.module';
import { PortfolioModule } from './modules/projects/portfolio.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { SyncModule } from './modules/sync/sync.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { WaterModule } from './modules/water/water.module';

/**
 * Root module of the FMS modular monolith. Wires platform concerns (config, persistence,
 * health, events, calendar), the shared-kernel (error contract, tenant isolation, audit
 * trail — MOD-01 complete), identity/auth/membership (MOD-02 complete), projects (MOD-03,
 * TASK-011), ponds/stocking/batches (MOD-04 complete), the alert engine (MOD-09, TASK-015/016),
 * the cross-project portfolio roll-up (MOD-03, TASK-012), mortality/treatments (MOD-07,
 * TASK-028), inventory (MOD-05, TASK-020), water readings/thresholds (MOD-06, TASK-023),
 * sampling/growth (MOD-07, TASK-029), tasks/missed-task detection (MOD-12, TASK-041),
 * critical-delivery retry/SLA escalation (MOD-09, TASK-017), the emergency water-event flow
 * (MOD-06, TASK-024), the offline sync endpoint (MOD-12, TASK-040), partial harvest (MOD-07,
 * TASK-031), finance costs/revenue/role-gate (MOD-08, TASK-032), read-only camera stream config
 * (MOD-10, TASK-035), the weather adapter/cache (MOD-10, TASK-036), and the daily owner summary
 * (MOD-10, TASK-037). `ScheduleModule.forRoot()`
 * is registered once here (not in a feature module) —
 * `MissedTaskScheduler` (MOD-12), `SlaEscalationScheduler` (MOD-09), and `FeedingReminderScheduler`
 * (MOD-05, TASK-021) all rely on it for their `@Cron()` jobs.
 */
@Module({
  imports: [
    ConfigModule,
    PersistenceModule,
    TransactionModule,
    HealthModule,
    EventsModule,
    ErrorsModule,
    TenantModule,
    AuditModule,
    CalendarModule,
    ScheduleModule.forRoot(),
    // Rate limiting for `/auth/*` is configured inside `IdentityModule`, which owns
    // `AuthController` — see the note there on why it can't live here.
    IdentityModule,
    ProjectsModule,
    PondsModule,
    NotificationsModule,
    PortfolioModule,
    MortalityHealthModule,
    InventoryModule,
    WaterModule,
    GrowthModule,
    TasksModule,
    FeedModule,
    SyncModule,
    HarvestModule,
    FinanceModule,
    MonitoringModule,
    ReportingModule,
  ],
})
export class AppModule {}
