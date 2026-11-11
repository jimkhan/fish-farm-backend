import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PortfolioFinancePort } from '../../projects/domain/portfolio-finance.port';
import { FinancialTxnPersistenceModel } from './persistence/financial-txn.persistence-model';

/**
 * TASK-033 implementation of MOD-03's `PortfolioFinancePort`. Unscoped, by explicit `projectId`
 * (like `PortfolioBiomassAdapter`/`PortfolioAlertsAdapter`) — the portfolio use-case aggregates
 * across MULTIPLE projects in one request, so there is no single `TenantContext` to scope
 * through. Single-currency BDT only (ADR-018) — a plain sum, no per-currency subtotals (BACKLOG's
 * own TASK-033 entry explicitly supersedes the module doc's pre-ADR-018 "per-currency subtotals"
 * language).
 */
@Injectable()
export class PortfolioFinanceAdapter implements PortfolioFinancePort {
  constructor(
    @InjectRepository(FinancialTxnPersistenceModel)
    private readonly repository: Repository<FinancialTxnPersistenceModel>,
  ) {}

  async getNetProfitMinorFor(projectIds: readonly string[]): Promise<Map<string, number>> {
    if (projectIds.length === 0) {
      return new Map();
    }
    // Net profit summed in SQL, grouped by project — one query for the whole portfolio, and no
    // longer loads every transaction row of every project into memory just to fold them.
    const rows = await this.repository
      .createQueryBuilder('txn')
      .select('txn.project_id', 'projectId')
      .addSelect(
        `COALESCE(SUM(CASE WHEN txn.kind = 'REVENUE' THEN txn.amount_minor ELSE -txn.amount_minor END), 0)`,
        'netMinor',
      )
      .where({ projectId: In([...projectIds]) })
      .groupBy('txn.project_id')
      .getRawMany<{ projectId: string; netMinor: string }>();

    return new Map(rows.map((row) => [row.projectId, Number(row.netMinor)]));
  }
}
