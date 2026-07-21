import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PondFeedAccumulatorEventRepositoryPort } from '../application/ports/pond-feed-accumulator-event-repository.port';
import { PondFeedAccumulatorPersistenceModel } from './persistence/pond-feed-accumulator.persistence-model';

/** Unscoped — see `PondFeedAccumulatorEventRepositoryPort`'s doc comment for why. */
@Injectable()
export class TypeOrmPondFeedAccumulatorEventRepository implements PondFeedAccumulatorEventRepositoryPort {
  constructor(
    @InjectRepository(PondFeedAccumulatorPersistenceModel)
    private readonly repository: Repository<PondFeedAccumulatorPersistenceModel>,
  ) {}

  async incrementFeedKg(projectId: string, pondId: string, deltaKg: number): Promise<void> {
    const existing = await this.repository.findOne({ where: { pondId } });
    if (existing) {
      existing.totalFeedKg += deltaKg;
      await this.repository.save(existing);
      return;
    }
    const model = new PondFeedAccumulatorPersistenceModel();
    model.projectId = projectId;
    model.pondId = pondId;
    model.totalFeedKg = deltaKg;
    await this.repository.save(model);
  }
}
