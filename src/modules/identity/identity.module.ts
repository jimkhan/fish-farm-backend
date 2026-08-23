import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AppEnv } from '../../platform/config/env.validation';
import { EventsModule } from '../../platform/events/events.module';
import { AuditModule } from '../../shared-kernel/audit/audit.module';
import { TransactionContext } from '../../platform/persistence/transaction-context';
import { MEMBERSHIP_RESOLVER } from '../../shared-kernel/tenant/membership-resolver.port';
import { ScopedRepository } from '../../shared-kernel/tenant/scoped-repository';
import { TenantContext } from '../../shared-kernel/tenant/tenant-context';
import { TenantModule } from '../../shared-kernel/tenant/tenant.module';
import { ConfirmResetUseCase } from './application/confirm-reset.usecase';
import { GetMeUseCase } from './application/get-me.usecase';
import { InviteMemberUseCase } from './application/invite-member.usecase';
import { ListMembersUseCase } from './application/list-members.usecase';
import { LoginUseCase } from './application/login.usecase';
import { ACCESS_TOKEN_ISSUER } from './application/ports/access-token-issuer.port';
import { INITIAL_OWNER_MEMBERSHIP } from './application/ports/initial-owner-membership.port';
import { MEMBERSHIP_DIRECTORY } from './application/ports/membership-directory.port';
import { PASSWORD_HASHER } from './application/ports/password-hasher.port';
import { PASSWORD_RESET_NOTIFIER } from './application/ports/password-reset-notifier.port';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from './application/ports/password-reset-token-repository.port';
import { PROJECT_MEMBERSHIP_REPOSITORY } from './application/ports/project-membership-repository.port';
import { PROJECT_MEMBERS_DIRECTORY } from './application/ports/project-members-directory.port';
import { REFRESH_TOKEN_REPOSITORY } from './application/ports/refresh-token-repository.port';
import { USER_REPOSITORY } from './application/ports/user-repository.port';
import { RefreshUseCase } from './application/refresh.usecase';
import { RemoveMemberUseCase } from './application/remove-member.usecase';
import { RequestResetUseCase } from './application/request-reset.usecase';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { InitialOwnerMembership } from './infrastructure/initial-owner-membership';
import { JwtAccessTokenIssuer } from './infrastructure/jwt-access-token-issuer';
import { LoggingPasswordResetNotifier } from './infrastructure/logging-password-reset-notifier';
import { MembershipResolver } from './infrastructure/membership-resolver';
import { PasswordResetTokenPersistenceModel } from './infrastructure/persistence/password-reset-token.persistence-model';
import { ProjectMembershipPersistenceModel } from './infrastructure/persistence/project-membership.persistence-model';
import { RefreshTokenPersistenceModel } from './infrastructure/persistence/refresh-token.persistence-model';
import { UserPersistenceModel } from './infrastructure/persistence/user.persistence-model';
import { TypeOrmPasswordResetTokenRepository } from './infrastructure/typeorm-password-reset-token.repository';
import { TypeOrmProjectMembershipRepository } from './infrastructure/typeorm-project-membership.repository';
import { TypeOrmRefreshTokenRepository } from './infrastructure/typeorm-refresh-token.repository';
import { TypeOrmUserRepository } from './infrastructure/typeorm-user.repository';
import { AuthController } from './presentation/auth.controller';
import { AuthMiddleware } from './presentation/auth.middleware';
import { AuthenticatedGuard } from './presentation/authenticated.guard';
import { MeController } from './presentation/me.controller';
import { MembersController } from './presentation/members.controller';

/**
 * MOD-02, complete: auth (TASK-008), password reset (TASK-009), membership/RBAC (TASK-010).
 *
 * `@Global()`: MOD-01's `ProjectScopeGuard` (registered `APP_GUARD` inside `TenantModule`, a
 * sibling of this module under `AppModule`) injects `MembershipResolverPort` by DI token — but
 * NestJS module encapsulation means a provider's dependencies resolve only against its OWN
 * module's imports/providers, never a sibling's, even when both are imported by the same root.
 * `TenantModule` deliberately does NOT import this module (MOD-01 "depends on the interface, not
 * on this module" — MOD-02 doc §4.6), so the only way `ProjectScopeGuard` can see the binding
 * without inverting that dependency is for this module's exports to be visible app-wide.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserPersistenceModel,
      RefreshTokenPersistenceModel,
      PasswordResetTokenPersistenceModel,
      ProjectMembershipPersistenceModel,
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
      }),
    }),
    // TenantContext (membership use-cases) + TransactionContext (audit-joined writes) +
    // DomainEventBus (MemberInvited/MemberRemoved) — none of these are global modules.
    TenantModule,
    AuditModule,
    EventsModule,
    // Rate-limit buckets for the unauthenticated `/auth/*` surface. Configured HERE, not in
    // `AppModule`, because this module owns `AuthController` and therefore its `ThrottlerGuard`:
    // the 29 e2e suites assemble their own trimmed-down app modules that import `IdentityModule`
    // without `AppModule`, so configuring it upstream left `THROTTLER:MODULE_OPTIONS`
    // unresolvable and broke every one of them. Keeping the guard and its options in one module
    // means anything that can serve `/auth/*` is necessarily configured to throttle it.
    //
    // The guard is deliberately NOT an `APP_GUARD`: the throttled surface is the pre-session one,
    // where an anonymous caller can burn argon2 verifications or trigger token minting without
    // limit. Authenticated, project-scoped traffic is already bounded by membership.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => ({
        throttlers: [
          { name: 'auth-burst', ttl: 60_000, limit: 10 },
          { name: 'auth-sustained', ttl: 900_000, limit: 40 },
        ],
        // Off under NODE_ENV=test. The e2e suites drive dozens of genuine logins (18 in
        // `membership.e2e-spec`, 13 in `auth.e2e-spec`) from one loopback address, so a
        // production-grade per-IP limit would 429 them and fail tests for reasons unrelated to
        // what they assert. Follow-up worth carding: a dedicated e2e that enables the limiter
        // and asserts the 429 — with this skip, nothing currently exercises it end to end.
        skipIf: () => config.get('NODE_ENV', { infer: true }) === 'test',
      }),
    }),
  ],
  controllers: [AuthController, MeController, MembersController],
  providers: [
    // Global authentication (`security: [bearerAuth]` is the contract's document-level default).
    // Registered here rather than in TenantModule because auth is MOD-02's concern; it composes
    // with TenantModule's `ProjectScopeGuard` in any order, since `AuthMiddleware` — middleware,
    // so always ahead of every guard — is what actually populates `request.user`.
    { provide: APP_GUARD, useClass: AuthenticatedGuard },
    LoginUseCase,
    RefreshUseCase,
    RequestResetUseCase,
    ConfirmResetUseCase,
    GetMeUseCase,
    ListMembersUseCase,
    InviteMemberUseCase,
    RemoveMemberUseCase,
    { provide: USER_REPOSITORY, useClass: TypeOrmUserRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: TypeOrmRefreshTokenRepository },
    { provide: PASSWORD_RESET_TOKEN_REPOSITORY, useClass: TypeOrmPasswordResetTokenRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: ACCESS_TOKEN_ISSUER, useClass: JwtAccessTokenIssuer },
    { provide: PASSWORD_RESET_NOTIFIER, useClass: LoggingPasswordResetNotifier },
    // MembershipResolver implements BOTH ports off the same cross-project query (TASK-010,
    // MOD-02 §4.6) — bound once, the second token reuses the same instance.
    { provide: MEMBERSHIP_RESOLVER, useClass: MembershipResolver },
    { provide: MEMBERSHIP_DIRECTORY, useExisting: MEMBERSHIP_RESOLVER },
    { provide: PROJECT_MEMBERS_DIRECTORY, useExisting: MEMBERSHIP_RESOLVER },
    { provide: INITIAL_OWNER_MEMBERSHIP, useClass: InitialOwnerMembership },
    // Request-scoped: depends on TenantContext (Scope.REQUEST), so Nest promotes this provider
    // (and everything that injects it) to request scope automatically.
    {
      provide: PROJECT_MEMBERSHIP_REPOSITORY,
      useFactory: (
        repository: Repository<ProjectMembershipPersistenceModel>,
        tenant: TenantContext,
        transactions: TransactionContext,
      ) =>
        new TypeOrmProjectMembershipRepository(
          new ScopedRepository(repository, tenant, transactions),
        ),
      inject: [getRepositoryToken(ProjectMembershipPersistenceModel), TenantContext, TransactionContext],
    },
  ],
  // Exported so MOD-01's ProjectScopeGuard (bound via TenantModule's APP_GUARD) can resolve
  // MembershipResolverPort; so a later module can reuse UserRepositoryPort; so MOD-03 can
  // bootstrap a new project's OWNER membership directly (MOD-03 depends on MOD-02, no inversion);
  // so MOD-03's `GET /projects` can read the caller's cross-project memberships the same way
  // `GET /me` does; and so MOD-09's `RecipientResolver` can resolve a project's members (TASK-015).
  exports: [
    USER_REPOSITORY,
    MEMBERSHIP_RESOLVER,
    MEMBERSHIP_DIRECTORY,
    PROJECT_MEMBERS_DIRECTORY,
    INITIAL_OWNER_MEMBERSHIP,
  ],
})
export class IdentityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
