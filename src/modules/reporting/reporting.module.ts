import { Module } from '@nestjs/common';
import { TenantModule } from '../../shared-kernel/tenant/tenant.module';
import { FeedModule } from '../feed/feed.module';
import { GrowthModule } from '../growth/growth.module';
import { MortalityHealthModule } from '../health/health.module';
import { HarvestModule } from '../harvest/harvest.module';
import { TasksModule } from '../tasks/tasks.module';
import { WaterModule } from '../water/water.module';
import { ExportReportUseCase } from './application/export-report.usecase';
import { GetDailySummaryUseCase } from './application/get-daily-summary.usecase';
import { ReportExportController } from './presentation/report-export.controller';
import { ReportingController } from './presentation/reporting.controller';

/**
 * MOD-10's reporting slice: the daily owner summary (TASK-037, live-composed query) and the
 * report exports (TASK-038, CON-046 — growth/financial/harvest CSV). Both compose already-
 * published read-models from sibling modules rather than importing domain internals (module doc
 * §4.5/§4.6), with no port-inversion layer since there's no cyclic dependency to solve.
 *
 * None of `FeedModule`/`MortalityHealthModule`/`WaterModule`/`TasksModule`/`GrowthModule`/
 * `HarvestModule` are `@Global()`, so each is imported explicitly for the ports/use-cases the two
 * report builders read. `FinanceModule` **is** `@Global()`, so `GetFinanceSummaryUseCase`/
 * `FINANCIAL_TXN_REPOSITORY` (which it now exports) are injectable without an explicit import.
 */
@Module({
  imports: [
    // TASK-038: the export use-case injects TenantContext directly (for the caller's role, to gate
    // the financial export per-kind). The daily-summary use-case never needed it — it reads only
    // through already-tenant-scoped repositories — so this import is new with the export slice.
    TenantModule,
    FeedModule,
    MortalityHealthModule,
    WaterModule,
    TasksModule,
    GrowthModule,
    HarvestModule,
  ],
  controllers: [ReportingController, ReportExportController],
  providers: [GetDailySummaryUseCase, ExportReportUseCase],
})
export class ReportingModule {}
