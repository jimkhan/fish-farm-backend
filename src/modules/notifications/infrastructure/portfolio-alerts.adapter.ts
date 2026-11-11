import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { PortfolioAlertsPort } from '../../projects/domain/portfolio-alerts.port';
import { AlertPersistenceModel } from './persistence/alert.persistence-model';

/**
 * TASK-012 implementation of MOD-03's `PortfolioAlertsPort`. Unscoped, by explicit `projectId`
 * (like `TypeOrmAlertEventRepository`) — the portfolio use-case aggregates across MULTIPLE
 * projects in one request, so there is no single `TenantContext` to scope through. "Open" means
 * not yet `RESOLVED` (`Alert.isActive`) — an `ACKNOWLEDGED` critical alert is still open until
 * actually resolved.
 */
@Injectable()
export class PortfolioAlertsAdapter implements PortfolioAlertsPort {
  constructor(
    @InjectRepository(AlertPersistenceModel)
    private readonly repository: Repository<AlertPersistenceModel>,
  ) {}

  async countOpenCriticalFor(projectIds: readonly string[]): Promise<Map<string, number>> {
    if (projectIds.length === 0) {
      return new Map();
    }
    // One grouped COUNT for the whole portfolio instead of one per project.
    const rows = await this.repository
      .createQueryBuilder('alert')
      .select('alert.project_id', 'projectId')
      .addSelect('COUNT(*)', 'count')
      .where({ projectId: In([...projectIds]), severity: 'CRITICAL', state: Not('RESOLVED') })
      .groupBy('alert.project_id')
      .getRawMany<{ projectId: string; count: string }>();

    return new Map(rows.map((row) => [row.projectId, Number(row.count)]));
  }
}
