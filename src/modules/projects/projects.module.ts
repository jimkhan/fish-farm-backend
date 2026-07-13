import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from '../../platform/events/events.module';
import { AuditModule } from '../../shared-kernel/audit/audit.module';
import { TenantModule } from '../../shared-kernel/tenant/tenant.module';
import { CreateProjectUseCase } from './application/create-project.usecase';
import { GetProjectUseCase } from './application/get-project.usecase';
import { ListProjectsUseCase } from './application/list-projects.usecase';
import { PROJECT_REPOSITORY } from './application/ports/project-repository.port';
import { UpdateProjectUseCase } from './application/update-project.usecase';
import { ProjectPersistenceModel } from './infrastructure/persistence/project.persistence-model';
import { TypeOrmProjectRepository } from './infrastructure/typeorm-project.repository';
import { ProjectsController } from './presentation/projects.controller';

/**
 * MOD-03's project-CRUD slice (TASK-011). `IdentityModule` is `@Global()` (TASK-010), so
 * `MembershipDirectoryPort`/`InitialOwnerMembershipPort` are injectable here without an explicit
 * import — MOD-03 depends on MOD-02 directly (module doc §1 dependencies, no inversion needed).
 *
 * `@Global()` (TASK-018): MOD-04's `CreatePondUseCase` needs `ProjectRepositoryPort` (to check
 * R7 — no ponds on a `CLOSED` project) — a straightforward MOD-04→MOD-03 dependency, but MOD-04
 * is deliberately not imported here (that's the inverted `ProvisionFirstPondPort` direction, kept
 * acyclic), so `ProjectsModule` cannot import `PondsModule` back to complete a two-way `imports`
 * chain. Same fix as `IdentityModule`: export app-wide instead.
 *
 * Portfolio (CON-035, TASK-012) is deliberately a SEPARATE module (`PortfolioModule`), not bundled
 * in here — it needs `PondsModule` (biomass) and `NotificationsModule` (alerts) too, and bundling
 * that into this always-loaded module would force every test app that needs plain project CRUD to
 * also wire up ponds/notifications just to satisfy eager DI resolution.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectPersistenceModel]),
    // TenantContext (scoped reads/writes) + TransactionContext (audit-joined atomic create) +
    // DomainEventBus (ProjectCreated/ProjectClosed) — none of these are global modules.
    TenantModule,
    AuditModule,
    EventsModule,
  ],
  controllers: [ProjectsController],
  providers: [
    ListProjectsUseCase,
    CreateProjectUseCase,
    GetProjectUseCase,
    UpdateProjectUseCase,
    { provide: PROJECT_REPOSITORY, useClass: TypeOrmProjectRepository },
  ],
  exports: [PROJECT_REPOSITORY],
})
export class ProjectsModule {}
