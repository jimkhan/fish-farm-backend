import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventsModule } from '../../platform/events/events.module';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { AuditModule } from '../../shared-kernel/audit/audit.module';
import { ScopedRepository } from '../../shared-kernel/tenant/scoped-repository';
import { TenantContext } from '../../shared-kernel/tenant/tenant-context';
import { TenantModule } from '../../shared-kernel/tenant/tenant.module';
import { CompleteTaskUseCase } from './application/complete-task.usecase';
import { CreateTaskUseCase } from './application/create-task.usecase';
import { ListTasksUseCase } from './application/list-tasks.usecase';
import { MissedTaskScheduler } from './application/missed-task.scheduler';
import { TASK_EVENT_REPOSITORY } from './application/ports/task-event-repository.port';
import { TASK_LOG_REPOSITORY } from './application/ports/task-log-repository.port';
import { TASK_REPOSITORY } from './application/ports/task-repository.port';
import { TaskLogPersistenceModel } from './infrastructure/persistence/task-log.persistence-model';
import { TaskPersistenceModel } from './infrastructure/persistence/task.persistence-model';
import { TypeOrmTaskEventRepository } from './infrastructure/typeorm-task-event.repository';
import { TypeOrmTaskLogRepository } from './infrastructure/typeorm-task-log.repository';
import { TypeOrmTaskRepository } from './infrastructure/typeorm-task.repository';
import { TaskLogsController } from './presentation/task-logs.controller';
import { TasksController } from './presentation/tasks.controller';

/**
 * MOD-12's backend task slice (TASK-041 — definitions, logs, missed-task detection; the mobile
 * app shell/offline engine and `POST /sync` are separate tasks — TASK-040/042/043/044).
 * `PondsModule`/`ProjectsModule` are `@Global()`, so `PondRepositoryPort`/`ProjectRepositoryPort`
 * are injectable without an explicit import — a straightforward MOD-12→MOD-04/MOD-03 forward
 * dependency (module doc §1). `ScheduleModule.forRoot()` lives in `AppModule` (root) — TASK-017
 * added a second `@Cron()` consumer (`SlaEscalationScheduler`, MOD-09), and registering the
 * schedule infrastructure once at the root avoids the ambiguity of importing it from two sibling
 * feature modules.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TaskPersistenceModel, TaskLogPersistenceModel]),
    TenantModule,
    AuditModule,
    EventsModule,
  ],
  controllers: [TasksController, TaskLogsController],
  providers: [
    ListTasksUseCase,
    CreateTaskUseCase,
    CompleteTaskUseCase,
    MissedTaskScheduler,
    { provide: TASK_EVENT_REPOSITORY, useClass: TypeOrmTaskEventRepository },
    // Request-scoped: depends on TenantContext (Scope.REQUEST) — same factory shape as
    // TypeOrmProjectMembershipRepository (TASK-010).
    {
      provide: TASK_REPOSITORY,
      useFactory: (
        repository: Repository<TaskPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmTaskRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(TaskPersistenceModel), TenantContext, TransactionContext],
    },
    {
      provide: TASK_LOG_REPOSITORY,
      useFactory: (
        repository: Repository<TaskLogPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) => new TypeOrmTaskLogRepository(new ScopedRepository(repository, tenant, transactions)),
      inject: [getRepositoryToken(TaskLogPersistenceModel), TenantContext, TransactionContext],
    },
  ],
})
export class TasksModule {}
