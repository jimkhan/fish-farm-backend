import { MembershipResolverPort, ProjectRole } from '../../../shared-kernel/tenant/membership-resolver.port';
import { LogFeedingUseCase } from '../../feed/application/log-feeding.usecase';
import { LogMortalityUseCase } from '../../health/application/log-mortality.usecase';
import { RecordReadingUseCase } from '../../water/application/record-reading.usecase';
import { RaiseEmergencyUseCase } from '../../water/application/raise-emergency.usecase';
import { LogPondActionUseCase } from '../../water/application/log-pond-action.usecase';
import { RecordSamplingUseCase } from '../../growth/application/record-sampling.usecase';
import { CompleteTaskUseCase } from '../../tasks/application/complete-task.usecase';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { SyncMutation } from '../domain/sync-mutation.entity';
import { SyncMutationRepositoryPort } from './ports/sync-mutation-repository.port';
import { MutationDispatcher, SyncMutationRequest } from './mutation-dispatcher.service';

function makeMutation(overrides: Partial<SyncMutationRequest> = {}): SyncMutationRequest {
  return {
    clientMutationId: 'cm-1',
    entity: 'FEEDING_LOG',
    op: 'CREATE',
    payload: {
      projectId: 'p-1',
      batchId: 'batch-1',
      inventoryItemId: 'item-1',
      qtyKg: 5,
      fedAt: '2026-01-10T00:00:00.000Z',
    },
    ...overrides,
  };
}

function setup(
  overrides: {
    memberships?: Array<{ projectId: string; role: 'OWNER' | 'WORKER' | 'PARTNER' }>;
    existingMutation?: SyncMutation | null;
  } = {},
) {
  const request: { user?: { id: string }; tenant?: { userId: string; projectId: string; role: ProjectRole } } = {
    user: { id: 'u-1' },
  };
  const membershipResolver: jest.Mocked<MembershipResolverPort> = {
    resolve: jest
      .fn()
      .mockResolvedValue(overrides.memberships ?? [{ projectId: 'p-1', role: 'WORKER' }]),
  };
  const syncMutations: jest.Mocked<SyncMutationRepositoryPort> = {
    findByClientMutationId: jest.fn().mockResolvedValue(overrides.existingMutation ?? null),
    save: jest.fn().mockImplementation((m: SyncMutation) => Promise.resolve(m)),
  };

  const logFeeding = { execute: jest.fn().mockResolvedValue({ id: 'fl-1' }) } as unknown as jest.Mocked<LogFeedingUseCase>;
  const logMortality = { execute: jest.fn().mockResolvedValue({ id: 'm-1' }) } as unknown as jest.Mocked<LogMortalityUseCase>;
  const recordReading = { execute: jest.fn().mockResolvedValue({ id: 'wr-1' }) } as unknown as jest.Mocked<RecordReadingUseCase>;
  const raiseEmergency = { execute: jest.fn().mockResolvedValue({ id: 'alert-1' }) } as unknown as jest.Mocked<RaiseEmergencyUseCase>;
  const recordSampling = { execute: jest.fn().mockResolvedValue({ id: 's-1' }) } as unknown as jest.Mocked<RecordSamplingUseCase>;
  const completeTask = { execute: jest.fn().mockResolvedValue({ id: 'tl-1' }) } as unknown as jest.Mocked<CompleteTaskUseCase>;
  const logPondAction = { execute: jest.fn().mockResolvedValue({ id: 'pa-1' }) } as unknown as jest.Mocked<LogPondActionUseCase>;

  const dispatcher = new MutationDispatcher(
    request,
    membershipResolver,
    syncMutations,
    logFeeding,
    logMortality,
    recordReading,
    raiseEmergency,
    recordSampling,
    completeTask,
    logPondAction,
  );

  return {
    dispatcher,
    request,
    membershipResolver,
    syncMutations,
    logFeeding,
    logMortality,
    recordReading,
    raiseEmergency,
    recordSampling,
    completeTask,
    logPondAction,
  };
}

describe('MutationDispatcher (TASK-040, F3/CON-040, AC-129/130/131/132/137)', () => {
  it('AC-129/R6: dispatches FEEDING_LOG through LogFeedingUseCase (the same online use-case)', async () => {
    const { dispatcher, logFeeding } = setup();
    const results = await dispatcher.processBatch([makeMutation()]);

    expect(results).toEqual([{ clientMutationId: 'cm-1', status: 'SYNCED', serverId: 'fl-1' }]);
    expect(logFeeding.execute).toHaveBeenCalledWith('batch-1', {
      inventoryItemId: 'item-1',
      qtyKg: 5,
      fedAt: new Date('2026-01-10T00:00:00.000Z'),
      observation: undefined,
      clientMutationId: 'cm-1',
    });
  });

  it('AC-130/R4: a clientMutationId already recorded returns the stored result without re-dispatching', async () => {
    const existing = SyncMutation.reconstitute({
      clientMutationId: 'cm-1',
      projectId: 'p-1',
      userId: 'u-1',
      entity: 'FEEDING_LOG',
      status: 'SYNCED',
      serverId: 'fl-1',
      processedAt: new Date(),
    });
    const { dispatcher, logFeeding } = setup({ existingMutation: existing });
    const results = await dispatcher.processBatch([makeMutation()]);

    expect(results).toEqual([{ clientMutationId: 'cm-1', status: 'SYNCED', serverId: 'fl-1' }]);
    expect(logFeeding.execute).not.toHaveBeenCalled();
  });

  it('AC-137: a previously-FAILED clientMutationId is re-attempted on replay, not returned stale', async () => {
    const previouslyFailed = SyncMutation.reconstitute({
      clientMutationId: 'cm-1',
      projectId: 'p-1',
      userId: 'u-1',
      entity: 'FEEDING_LOG',
      status: 'FAILED',
      serverId: null,
      processedAt: new Date(),
    });
    const { dispatcher, logFeeding, syncMutations } = setup({ existingMutation: previouslyFailed });
    const results = await dispatcher.processBatch([makeMutation()]);

    expect(logFeeding.execute).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ clientMutationId: 'cm-1', status: 'SYNCED', serverId: 'fl-1' }]);
    expect(syncMutations.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'SYNCED', serverId: 'fl-1' }));
  });

  it('a dispatch-time DomainError persists a FAILED row (overwritable on the next retry)', async () => {
    const { dispatcher, logFeeding, syncMutations } = setup();
    logFeeding.execute.mockRejectedValueOnce(new NotFoundError('Batch not found.'));

    await dispatcher.processBatch([makeMutation()]);

    expect(syncMutations.save).toHaveBeenCalledWith(
      expect.objectContaining({ clientMutationId: 'cm-1', status: 'FAILED', projectId: 'p-1', userId: 'u-1' }),
    );
  });

  it('R4: a genuinely new project scope is set correctly per mutation (tenant re-scoping between mutations)', async () => {
    const { dispatcher, request, recordReading } = setup({
      memberships: [
        { projectId: 'p-1', role: 'WORKER' },
        { projectId: 'p-2', role: 'OWNER' },
      ],
    });
    await dispatcher.processBatch([
      makeMutation({
        clientMutationId: 'cm-a',
        entity: 'WATER_READING',
        payload: { projectId: 'p-2', pondId: 'pond-1', parameter: 'DO', value: 5, readAt: '2026-01-10T00:00:00.000Z' },
      }),
    ]);

    expect(recordReading.execute).toHaveBeenCalledWith('pond-1', expect.objectContaining({ parameter: 'DO', value: 5 }));
    expect(request.tenant).toEqual({ userId: 'u-1', projectId: 'p-2', role: 'OWNER' });
  });

  it('AC-137: a FORBIDDEN mutation (non-member project) fails without aborting the batch or throwing', async () => {
    const { dispatcher, logFeeding } = setup({ memberships: [] });
    const results = await dispatcher.processBatch([makeMutation()]);

    expect(results[0].status).toBe('FAILED');
    expect(results[0].error?.code).toBe('FORBIDDEN');
    expect(logFeeding.execute).not.toHaveBeenCalled();
  });

  it('a PARTNER (read-only, no canWrite) mutation fails with FORBIDDEN', async () => {
    const { dispatcher } = setup({ memberships: [{ projectId: 'p-1', role: 'PARTNER' }] });
    const results = await dispatcher.processBatch([makeMutation()]);
    expect(results[0].status).toBe('FAILED');
    expect(results[0].error?.code).toBe('FORBIDDEN');
  });

  it('AC-137: a mutation that throws a DomainError fails with that error mapped, without aborting the rest of the batch', async () => {
    const { dispatcher, logFeeding, logMortality } = setup();
    logFeeding.execute.mockRejectedValueOnce(new NotFoundError('Batch not found.'));

    const results = await dispatcher.processBatch([
      makeMutation({ clientMutationId: 'cm-fail' }),
      makeMutation({
        clientMutationId: 'cm-ok',
        entity: 'MORTALITY',
        payload: { projectId: 'p-1', batchId: 'batch-1', count: 2, causeCategory: 'disease', occurredAt: '2026-01-10T00:00:00.000Z' },
      }),
    ]);

    expect(results[0]).toEqual({
      clientMutationId: 'cm-fail',
      status: 'FAILED',
      serverId: null,
      error: { code: 'NOT_FOUND', message: 'Batch not found.' },
    });
    expect(results[1]).toEqual({ clientMutationId: 'cm-ok', status: 'SYNCED', serverId: 'm-1' });
    expect(logMortality.execute).toHaveBeenCalled();
  });

  it('AC-088: POND_ACTION dispatches through LogPondActionUseCase (TASK-025)', async () => {
    const { dispatcher, logPondAction } = setup();
    const results = await dispatcher.processBatch([
      makeMutation({
        entity: 'POND_ACTION',
        payload: {
          projectId: 'p-1',
          pondId: 'pond-1',
          actionType: 'CHAIN_DRAG',
          performedAt: '2026-01-10T00:00:00.000Z',
          notes: 'Bottom looked clean',
        },
      }),
    ]);

    expect(logPondAction.execute).toHaveBeenCalledWith('pond-1', {
      actionType: 'CHAIN_DRAG',
      performedAt: new Date('2026-01-10T00:00:00.000Z'),
      notes: 'Bottom looked clean',
      clientMutationId: 'cm-1',
    });
    expect(results[0]).toEqual({ clientMutationId: 'cm-1', status: 'SYNCED', serverId: 'pa-1' });
  });

  it('WATER_EVENT dispatches through RaiseEmergencyUseCase with no clientMutationId in its input (dedup handled upstream)', async () => {
    const { dispatcher, raiseEmergency } = setup();
    const results = await dispatcher.processBatch([
      makeMutation({
        entity: 'WATER_EVENT',
        payload: { projectId: 'p-1', pondId: 'pond-1', note: 'DO crashing' },
      }),
    ]);
    expect(raiseEmergency.execute).toHaveBeenCalledWith({ pondId: 'pond-1', note: 'DO crashing' });
    expect(results[0]).toEqual({ clientMutationId: 'cm-1', status: 'SYNCED', serverId: 'alert-1' });
  });

  it('SAMPLING dispatches through RecordSamplingUseCase', async () => {
    const { dispatcher, recordSampling } = setup();
    await dispatcher.processBatch([
      makeMutation({
        entity: 'SAMPLING',
        payload: { projectId: 'p-1', batchId: 'batch-1', sampleSize: 30, avgWeightG: 50, sampledOn: '2026-01-10' },
      }),
    ]);
    expect(recordSampling.execute).toHaveBeenCalledWith('batch-1', expect.objectContaining({ sampleSize: 30, avgWeightG: 50 }));
  });

  it('TASK_LOG dispatches through CompleteTaskUseCase', async () => {
    const { dispatcher, completeTask } = setup();
    await dispatcher.processBatch([
      makeMutation({
        entity: 'TASK_LOG',
        payload: { projectId: 'p-1', taskId: 'task-1', completedAt: '2026-01-10T00:00:00.000Z' },
      }),
    ]);
    expect(completeTask.execute).toHaveBeenCalledWith('task-1', expect.objectContaining({ clientMutationId: 'cm-1' }));
  });

  it('a missing "projectId" in the payload fails as a validation error, not a crash', async () => {
    const { dispatcher } = setup();
    const results = await dispatcher.processBatch([makeMutation({ payload: { batchId: 'batch-1' } })]);
    expect(results[0].status).toBe('FAILED');
    expect(results[0].error?.code).toBe('VALIDATION');
  });

  it('R2/edge case 1: mutations are processed in order', async () => {
    const { dispatcher, logFeeding } = setup();
    const order: string[] = [];
    logFeeding.execute.mockImplementation(async (batchId: string, input: { clientMutationId: string }) => {
      order.push(input.clientMutationId);
      return { id: `fl-${input.clientMutationId}` } as never;
    });

    await dispatcher.processBatch([
      makeMutation({ clientMutationId: 'cm-1' }),
      makeMutation({ clientMutationId: 'cm-2' }),
      makeMutation({ clientMutationId: 'cm-3' }),
    ]);
    expect(order).toEqual(['cm-1', 'cm-2', 'cm-3']);
  });
});
