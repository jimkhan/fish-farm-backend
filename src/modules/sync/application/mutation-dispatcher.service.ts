import { Inject, Injectable } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import {
  DomainError,
  ForbiddenError,
  UnauthenticatedError,
  ValidationError,
} from '../../../shared-kernel/errors/domain-error';
import {
  MEMBERSHIP_RESOLVER,
  MembershipResolverPort,
} from '../../../shared-kernel/tenant/membership-resolver.port';
import { RequestWithTenant } from '../../../shared-kernel/tenant/tenant-context';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { LogFeedingUseCase } from '../../feed/application/log-feeding.usecase';
import { LogMortalityUseCase } from '../../health/application/log-mortality.usecase';
import { RecordReadingUseCase } from '../../water/application/record-reading.usecase';
import { RaiseEmergencyUseCase } from '../../water/application/raise-emergency.usecase';
import { LogPondActionUseCase } from '../../water/application/log-pond-action.usecase';
import { WaterParameter } from '../../water/domain/water-reading.entity';
import { PondActionType } from '../../water/domain/pond-action.entity';
import { RecordSamplingUseCase } from '../../growth/application/record-sampling.usecase';
import { CompleteTaskUseCase } from '../../tasks/application/complete-task.usecase';
import { SyncMutation, SyncEntityType } from '../domain/sync-mutation.entity';
import { SYNC_MUTATION_REPOSITORY, SyncMutationRepositoryPort } from './ports/sync-mutation-repository.port';
import { optionalEnum, optionalString, requireDate, requireEnum, requireNumber, requireString } from './payload.util';

const WATER_PARAMETERS: readonly WaterParameter[] = [
  'DO',
  'TEMP',
  'PH',
  'AMMONIA',
  'NITRITE',
  'ALKALINITY',
  'SECCHI',
];
const POND_ACTION_TYPES: readonly PondActionType[] = ['CHAIN_DRAG', 'AERATION'];
const FEED_OBSERVATIONS = ['NORMAL', 'LEFTOVER', 'EMPTY'] as const;
const CAN_WRITE_ROLES = rolesWithCapability('canWrite');

export interface SyncMutationRequest {
  readonly clientMutationId: string;
  readonly entity: SyncEntityType;
  readonly op: 'CREATE';
  readonly payload: Record<string, unknown>;
}

export interface SyncMutationResult {
  readonly clientMutationId: string;
  readonly status: 'SYNCED' | 'CONFLICT' | 'FAILED';
  readonly serverId: string | null;
  readonly error?: { readonly code: string; readonly message: string };
}

interface RequestWithUser extends RequestWithTenant {
  user?: { id: string };
}

/**
 * `MutationDispatcher` (TASK-040, F3/CON-040, module doc §4.1/§4.5). Replays each queued
 * mutation through the **same domain use-case** the equivalent online endpoint calls (R6) — the
 * only genuinely new code here is authorization/scope resolution and the dispatch table itself.
 *
 * `/sync` carries no `:projectId` route param, so `ProjectScopeGuard` passes it through
 * untouched (it only ever populates `request.tenant` for a route with that param — see the
 * guard's own doc comment) and every downstream use-case's `TenantContext` would otherwise throw
 * `ScopeRequiredError`. Each mutation's `payload.projectId` supplies the scope instead: this
 * class re-resolves the caller's membership in that project (the exact same
 * `MembershipResolverPort` lookup `ProjectScopeGuard` performs) and populates `request.tenant`
 * itself, mutation-by-mutation — `TenantContext` reads `request.tenant` live on every property
 * access (never caches it), so re-assigning it between mutations correctly re-scopes every
 * already-injected, request-scoped use-case for the next one, even within a single `/sync` call
 * spanning mutations that (structurally) could target different projects.
 *
 * `canWrite` is re-checked here per mutation because dispatching straight into a use-case
 * bypasses the `RolesGuard`/`@Roles()` gate the online endpoint would have applied — all seven
 * dispatched entities are gated `canWrite` online (Worker mobile logs feedings/mortality/
 * readings/emergencies/samplings/task-completions/pond-actions; Partners are read-only
 * everywhere), so one uniform check replicates all seven online gates correctly. `POND_ACTION`
 * (TASK-025) has no *online* endpoint to mirror — CON-050 is reserved, not defined — so `/sync`
 * is its only write path; `canWrite` still applies since a Worker is the intended actor (module
 * doc §2.3).
 *
 * Every exception — `DomainError` or not — is caught **per mutation**, never left to escape this
 * class: `AuditInterceptor` wraps the whole `/sync` request in one DB transaction (TASK-005), so
 * an uncaught throw from mutation N would roll back mutations 1..N-1 that already succeeded in
 * the same batch, violating AC-137's per-mutation independence guarantee.
 */
@Injectable()
export class MutationDispatcher {
  constructor(
    @Inject(REQUEST) private readonly request: RequestWithUser,
    @Inject(MEMBERSHIP_RESOLVER) private readonly membershipResolver: MembershipResolverPort,
    @Inject(SYNC_MUTATION_REPOSITORY) private readonly syncMutations: SyncMutationRepositoryPort,
    private readonly logFeeding: LogFeedingUseCase,
    private readonly logMortality: LogMortalityUseCase,
    private readonly recordReading: RecordReadingUseCase,
    private readonly raiseEmergency: RaiseEmergencyUseCase,
    private readonly recordSampling: RecordSamplingUseCase,
    private readonly completeTask: CompleteTaskUseCase,
    private readonly logPondAction: LogPondActionUseCase,
  ) {}

  async processBatch(mutations: readonly SyncMutationRequest[]): Promise<SyncMutationResult[]> {
    const results: SyncMutationResult[] = [];
    // R2/edge case 1: replayed in order — a later mutation may depend on an earlier one having
    // already landed (e.g. two feedings against the same item).
    for (const mutation of mutations) {
      results.push(await this.processOne(mutation));
    }
    return results;
  }

  private async processOne(mutation: SyncMutationRequest): Promise<SyncMutationResult> {
    const existing = await this.syncMutations.findByClientMutationId(mutation.clientMutationId);
    if (existing?.isTerminal) {
      return { clientMutationId: mutation.clientMutationId, status: existing.status, serverId: existing.serverId };
    }

    // Known once auth/scope resolves below — only then is a `FAILED` row worth persisting
    // (ERD `SYNC_MUTATION.project_id`/`user_id` are NOT NULL; an unauthenticated/malformed
    // mutation never resolved either, so there is nothing legitimate to record against).
    let projectId: string | undefined;
    let userId: string | undefined;

    try {
      if (!this.request.user) {
        throw new UnauthenticatedError();
      }
      userId = this.request.user.id;

      projectId = requireString(mutation.payload, 'projectId');
      const memberships = await this.membershipResolver.resolve(userId);
      const membership = memberships.find((m) => m.projectId === projectId);
      if (!membership) {
        throw new ForbiddenError();
      }
      if (!CAN_WRITE_ROLES.includes(membership.role)) {
        throw new ForbiddenError('Partners have read-only access.');
      }
      this.request.tenant = { userId, projectId, role: membership.role };

      const serverId = await this.dispatch(mutation);

      await this.syncMutations.save(
        SyncMutation.reconstitute({
          clientMutationId: mutation.clientMutationId,
          projectId,
          userId,
          entity: mutation.entity,
          status: 'SYNCED',
          serverId,
          processedAt: new Date(),
        }),
      );

      return { clientMutationId: mutation.clientMutationId, status: 'SYNCED', serverId };
    } catch (error) {
      const errorInfo =
        error instanceof DomainError
          ? { code: error.code, message: error.message }
          : { code: 'INTERNAL', message: 'Something went wrong.' };

      // R4/AC-137: a `FAILED` row is not terminal — overwriting it (upsert by clientMutationId)
      // is exactly what lets the *next* replay re-attempt dispatch instead of returning stale.
      if (projectId && userId) {
        await this.syncMutations.save(
          SyncMutation.reconstitute({
            clientMutationId: mutation.clientMutationId,
            projectId,
            userId,
            entity: mutation.entity,
            status: 'FAILED',
            serverId: null,
            processedAt: new Date(),
          }),
        );
      }

      return { clientMutationId: mutation.clientMutationId, status: 'FAILED', serverId: null, error: errorInfo };
    }
  }

  private async dispatch(mutation: SyncMutationRequest): Promise<string> {
    const payload = mutation.payload;

    switch (mutation.entity) {
      case 'FEEDING_LOG': {
        const batchId = requireString(payload, 'batchId');
        const log = await this.logFeeding.execute(batchId, {
          inventoryItemId: requireString(payload, 'inventoryItemId'),
          qtyKg: requireNumber(payload, 'qtyKg'),
          fedAt: requireDate(payload, 'fedAt'),
          observation: optionalEnum(payload, 'observation', FEED_OBSERVATIONS),
          clientMutationId: mutation.clientMutationId,
        });
        return log.id;
      }
      case 'MORTALITY': {
        const batchId = requireString(payload, 'batchId');
        const mortality = await this.logMortality.execute(batchId, {
          count: requireNumber(payload, 'count'),
          causeCategory: requireString(payload, 'causeCategory'),
          photoUrl: optionalString(payload, 'photoUrl'),
          occurredAt: requireDate(payload, 'occurredAt'),
          clientMutationId: mutation.clientMutationId,
        });
        return mortality.id;
      }
      case 'WATER_READING': {
        const pondId = requireString(payload, 'pondId');
        const reading = await this.recordReading.execute(pondId, {
          parameter: requireEnum(payload, 'parameter', WATER_PARAMETERS),
          value: requireNumber(payload, 'value'),
          readAt: requireDate(payload, 'readAt'),
          clientMutationId: mutation.clientMutationId,
        });
        return reading.id;
      }
      case 'WATER_EVENT': {
        const alert = await this.raiseEmergency.execute({
          pondId: optionalString(payload, 'pondId'),
          note: optionalString(payload, 'note'),
        });
        return alert.id;
      }
      case 'SAMPLING': {
        const batchId = requireString(payload, 'batchId');
        const sampling = await this.recordSampling.execute(batchId, {
          sampleSize: requireNumber(payload, 'sampleSize'),
          avgWeightG: requireNumber(payload, 'avgWeightG'),
          sampledOn: requireDate(payload, 'sampledOn'),
          clientMutationId: mutation.clientMutationId,
        });
        return sampling.id;
      }
      case 'TASK_LOG': {
        const taskId = requireString(payload, 'taskId');
        const taskLog = await this.completeTask.execute(taskId, {
          completedAt: requireDate(payload, 'completedAt'),
          photoUrl: optionalString(payload, 'photoUrl'),
          clientMutationId: mutation.clientMutationId,
        });
        return taskLog.id;
      }
      case 'POND_ACTION': {
        const pondId = requireString(payload, 'pondId');
        const action = await this.logPondAction.execute(pondId, {
          actionType: requireEnum(payload, 'actionType', POND_ACTION_TYPES),
          performedAt: requireDate(payload, 'performedAt'),
          notes: optionalString(payload, 'notes'),
          clientMutationId: mutation.clientMutationId,
        });
        return action.id;
      }
      default:
        throw new ValidationError(`Unknown sync entity.`);
    }
  }
}
