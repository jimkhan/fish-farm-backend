import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PortfolioBiomassPort } from '../../projects/domain/portfolio-biomass.port';
import { aggregateBiomassBySpecies, totalBiomassKg } from '../domain/biomass.service';
import { toDomain } from './persistence/batch.mapper';
import { BatchPersistenceModel } from './persistence/batch.persistence-model';

/**
 * TASK-012 implementation of MOD-03's `PortfolioBiomassPort`. Unscoped, by explicit `projectId`
 * (like `TypeOrmBatchEventRepository`) — the portfolio use-case aggregates across MULTIPLE
 * projects in one request, so there is no single `TenantContext` to scope through. Reuses the
 * same pure `biomass.service.ts` the in-project `GET /biomass` endpoint (TASK-019) uses.
 */
@Injectable()
export class PortfolioBiomassAdapter implements PortfolioBiomassPort {
  constructor(
    @InjectRepository(BatchPersistenceModel)
    private readonly repository: Repository<BatchPersistenceModel>,
  ) {}

  async getTotalBiomassKgFor(projectIds: readonly string[]): Promise<Map<string, number>> {
    if (projectIds.length === 0) {
      return new Map();
    }

    // One fetch for the whole portfolio, then grouped in memory. Unlike the alert count and the
    // finance sum, this total cannot be pushed into SQL: it comes from the pure
    // `biomass.service.ts` the in-project `GET /biomass` endpoint also uses, and duplicating that
    // rule as a SQL expression would be two implementations of one calculation, free to diverge.
    const models = await this.repository.find({ where: { projectId: In([...projectIds]) } });

    const byProject = new Map<string, BatchPersistenceModel[]>();
    for (const model of models) {
      const bucket = byProject.get(model.projectId);
      if (bucket) {
        bucket.push(model);
      } else {
        byProject.set(model.projectId, [model]);
      }
    }

    const totals = new Map<string, number>();
    for (const [projectId, projectModels] of byProject) {
      const batches = projectModels.map(toDomain);
      const perSpecies = aggregateBiomassBySpecies(
        batches.map((batch) => ({
          speciesId: batch.speciesId,
          survivalEstimate: batch.survivalEstimate,
          survivorsExcludingHarvest: batch.survivorsExcludingHarvest,
          initialCount: batch.initialCount,
          latestAvgWeightG: batch.latestAvgWeightG,
        })),
      );
      totals.set(projectId, totalBiomassKg(perSpecies));
    }
    return totals;
  }
}
