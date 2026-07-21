import { Inject, Injectable } from '@nestjs/common';
import { formatDual, toBangla } from '@fish-farm/calendar';
import { ForbiddenError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import {
  FINANCIAL_TXN_REPOSITORY,
  FinancialTxnRepositoryPort,
} from '../../finance/application/ports/financial-txn-repository.port';
import {
  GetFinanceSummaryUseCase,
} from '../../finance/application/get-finance-summary.usecase';
import { GetGrowthUseCase } from '../../growth/application/get-growth.usecase';
import {
  HARVEST_REPOSITORY,
  HarvestRepositoryPort,
} from '../../harvest/application/ports/harvest-repository.port';
import { ROLE_CAPABILITIES } from '../../identity/domain/role-capability-matrix';
import { BATCH_REPOSITORY, BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import { toCsv } from '../domain/csv';

export type ReportKind = 'growth' | 'financial' | 'harvest';

export const REPORT_KINDS: readonly ReportKind[] = ['growth', 'financial', 'harvest'];

export interface ReportFile {
  /** Suggested download filename (drives Content-Disposition). */
  readonly filename: string;
  /** The report body (CSV text). */
  readonly content: string;
}

/** Dual Bangla+Gregorian rendering of a date (AC-126/R7 — via MOD-11's `@fish-farm/calendar`). */
function dual(date: Date): string {
  return formatDual(date, toBangla(date));
}

/**
 * `GET /projects/{projectId}/reports/export?kind=…` (CON-046, FT-057, AC-123/126, R6/R7). Composes
 * already-published read-models from MOD-07 (growth/harvest) and MOD-08 (finance) into a streamed
 * CSV — no reporting library, no new dependency (the contract's response is opaque
 * `application/octet-stream`, so CSV bytes satisfy it directly). Dates render dual via MOD-11.
 *
 * Role gate (R6/AC-123, human-confirmed): growth/harvest are available to **any** project member;
 * the **financial** export is restricted to `canAccessFinanceSettings` (OWNER + PARTNER, WORKER →
 * 403) — the exact same capability MOD-08's finance endpoints use, so the policy can't drift. The
 * gate lives here (not a route guard) because it depends on the `kind` query value, which a
 * class/method-level `@Roles()` can't see.
 */
@Injectable()
export class ExportReportUseCase {
  constructor(
    private readonly tenant: TenantContext,
    @Inject(BATCH_REPOSITORY) private readonly batches: BatchRepositoryPort,
    private readonly getGrowth: GetGrowthUseCase,
    @Inject(HARVEST_REPOSITORY) private readonly harvests: HarvestRepositoryPort,
    @Inject(FINANCIAL_TXN_REPOSITORY) private readonly txns: FinancialTxnRepositoryPort,
    private readonly getFinanceSummary: GetFinanceSummaryUseCase,
  ) {}

  async execute(kind: ReportKind): Promise<ReportFile> {
    const content = await this.buildContent(kind);
    const today = new Date().toISOString().slice(0, 10);
    return { filename: `${kind}-report-${today}.csv`, content };
  }

  private async buildContent(kind: ReportKind): Promise<string> {
    switch (kind) {
      case 'growth':
        return this.growthCsv();
      case 'harvest':
        return this.harvestCsv();
      case 'financial':
        this.requireFinanceAccess();
        return this.financialCsv();
      default:
        // Unreachable — the controller validates `kind` first — but keeps the switch total.
        throw new ValidationError('Unknown report type.');
    }
  }

  private requireFinanceAccess(): void {
    if (!ROLE_CAPABILITIES[this.tenant.role].canAccessFinanceSettings) {
      throw new ForbiddenError('The financial export is not available for your role.');
    }
  }

  private async growthCsv(): Promise<string> {
    const batches = await this.batches.findAllInCurrentProject();
    const rows = await Promise.all(
      batches.map(async (batch) => {
        const growth = await this.getGrowth.execute(batch.id);
        return [
          batch.id,
          growth.speciesId,
          dual(batch.stockedOn),
          batch.initialCount,
          batch.latestAvgWeightG,
          growth.adgGPerDay,
          growth.sgrPercentPerDay,
          growth.growthAnomaly ? 'yes' : 'no',
        ];
      }),
    );
    return toCsv(
      [
        'Batch ID',
        'Species ID',
        'Stocked On',
        'Initial Count',
        'Latest Avg Weight (g)',
        'ADG (g/day)',
        'SGR (%/day)',
        'Growth Anomaly',
      ],
      rows,
    );
  }

  private async harvestCsv(): Promise<string> {
    const harvests = await this.harvests.findAllInCurrentProject();
    const rows = harvests.map((h) => [
      h.id,
      h.batchId,
      dual(h.harvestedOn),
      h.quantity,
      h.totalWeightKg,
      h.grade,
      h.revenueMinor,
    ]);
    return toCsv(
      [
        'Harvest ID',
        'Batch ID',
        'Harvested On',
        'Quantity',
        'Total Weight (kg)',
        'Grade',
        'Revenue (BDT minor units)',
      ],
      rows,
    );
  }

  private async financialCsv(): Promise<string> {
    const txns = await this.txns.findAllInCurrentProject();
    const summary = await this.getFinanceSummary.execute();

    const txnRows = txns
      .slice()
      .sort((a, b) => a.occurredOn.getTime() - b.occurredOn.getTime())
      .map((t) => ['transaction', dual(t.occurredOn), t.kind, t.category, t.amountMinor, t.note]);

    // A trailing summary block (blank separator row), so a single CSV carries both the ledger and
    // the computed totals AC-110/111 already expose via the finance summary.
    const summaryRows = [
      [],
      ['summary', 'Total Cost (BDT minor units)', summary.totalCostMinor],
      ['summary', 'Total Revenue (BDT minor units)', summary.totalRevenueMinor],
      ['summary', 'Net Profit (BDT minor units)', summary.netProfitMinor],
      ['summary', 'Remaining Harvest Value (BDT minor units)', summary.remainingHarvestValueMinor],
      ['summary', 'Projected ROI (%)', summary.projectedRoiPct],
    ];

    return toCsv(
      ['Row Type', 'Occurred On / Metric', 'Kind', 'Category', 'Amount', 'Note'],
      [...txnRows, ...summaryRows],
    );
  }
}
