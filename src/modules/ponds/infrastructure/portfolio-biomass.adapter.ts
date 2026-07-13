import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async getTotalBiomassKg(projectId: string): Promise<number> {
    const models = await this.repository.find({ where: { projectId } });
    const batches = models.map(toDomain);
    const perSpecies = aggregateBiomassBySpecies(
      batches.map((batch) => ({
        speciesId: batch.speciesId,
        survivalEstimate: batch.survivalEstimate,
        initialCount: batch.initialCount,
        latestAvgWeightG: batch.latestAvgWeightG,
      })),
    );
    return totalBiomassKg(perSpecies);
  }
}
