import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedModule } from '../feed/feed.module';
import { GrowthModule } from '../growth/growth.module';
import { MortalityHealthModule } from '../health/health.module';
import { TasksModule } from '../tasks/tasks.module';
import { WaterModule } from '../water/water.module';
import { MutationDispatcher } from './application/mutation-dispatcher.service';
import { SYNC_MUTATION_REPOSITORY } from './application/ports/sync-mutation-repository.port';
import { SyncMutationPersistenceModel } from './infrastructure/persistence/sync-mutation.persistence-model';
import { TypeOrmSyncMutationRepository } from './infrastructure/typeorm-sync-mutation.repository';
import { SyncController } from './presentation/sync.controller';

/**
 * MOD-12's backend sync slice (TASK-040 — `POST /sync`, idempotency, dispatch; the task
 * scheduler/definitions/logs are TASK-041's, the mobile client is TASK-042/043, per the module
 * doc's own §4.2 file layout). None of `FeedModule`/`MortalityHealthModule`/`WaterModule`/
 * `GrowthModule`/`TasksModule` is `@Global()`, so all five are imported explicitly for the six
 * domain use-cases `MutationDispatcher` replays offline mutations through (R6, module doc §4.5
 * "one code path for offline + online"). `IdentityModule` is `@Global()`, so `MembershipResolverPort`
 * is injectable without an explicit import (the same lookup `ProjectScopeGuard` itself performs).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SyncMutationPersistenceModel]),
    FeedModule,
    MortalityHealthModule,
    WaterModule,
    GrowthModule,
    TasksModule,
  ],
  controllers: [SyncController],
  providers: [
    MutationDispatcher,
    { provide: SYNC_MUTATION_REPOSITORY, useClass: TypeOrmSyncMutationRepository },
  ],
})
export class SyncModule {}
