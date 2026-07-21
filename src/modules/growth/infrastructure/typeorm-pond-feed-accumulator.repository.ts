import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { PondFeedAccumulatorRepositoryPort } from '../application/ports/pond-feed-accumulator-repository.port';
import { PondFeedAccumulatorPersistenceModel } from './persistence/pond-feed-accumulator.persistence-model';

@Injectable()
export class TypeOrmPondFeedAccumulatorRepository implements PondFeedAccumulatorRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<PondFeedAccumulatorPersistenceModel>) {}

  async findTotalFeedKgForPond(pondId: string): Promise<number> {
    const [model] = await this.scoped.find({ pondId });
    return model?.totalFeedKg ?? 0;
  }
}
