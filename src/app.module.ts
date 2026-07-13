import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CalendarModule } from './platform/calendar/calendar.module';
import { ConfigModule } from './platform/config/config.module';
import { EventsModule } from './platform/events/events.module';
import { HealthModule } from './platform/health/health.module';
import { PersistenceModule } from './platform/persistence/persistence.module';
import { AuditModule } from './shared-kernel/audit/audit.module';
import { ErrorsModule } from './shared-kernel/errors/errors.module';
import { TenantModule } from './shared-kernel/tenant/tenant.module';
import { FeedModule } from './modules/feed/feed.module';
import { GrowthModule } from './modules/growth/growth.module';
import { IdentityModule } from './modules/identity/identity.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MortalityHealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PondsModule } from './modules/ponds/ponds.module';
import { PortfolioModule } from './modules/projects/portfolio.module';
import { ProjectsModule } from './modules/projects/projects.module';
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
 * critical-delivery retry/SLA escalation (MOD-09, TASK-017), and the emergency water-event flow
 * (MOD-06, TASK-024). `ScheduleModule.forRoot()` is registered once here (not in a feature
 * module) — `MissedTaskScheduler` (MOD-12), `SlaEscalationScheduler` (MOD-09), and
 * `FeedingReminderScheduler` (MOD-05, TASK-021) all rely on it for their `@Cron()` jobs.
 */
@Module({
  imports: [
    ConfigModule,
    PersistenceModule,
    HealthModule,
    EventsModule,
    ErrorsModule,
    TenantModule,
    AuditModule,
    CalendarModule,
    ScheduleModule.forRoot(),
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
  ],
})
export class AppModule {}
