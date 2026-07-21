import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import { Batch } from '../../ponds/domain/batch.entity';
import { Project } from '../../projects/domain/project.entity';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { ProjectRepositoryPort } from '../../projects/application/ports/project-repository.port';
import { Mortality } from '../domain/mortality.entity';
import { LogMortalityUseCase } from './log-mortality.usecase';
import { MortalityRepositoryPort } from './ports/mortality-repository.port';

const activeProjectProps = {
  id: 'p-1',
  name: 'Farm',
  siteLat: 23.8,
  siteLng: 90.4,
  address: null,
  currency: 'BDT' as const,
  landUnit: 'BIGHA' as const,
  status: 'ACTIVE' as const,
  createdAt: new Date(),
};
const project = Project.reconstitute(activeProjectProps);

const batch = Batch.reconstitute({
  id: 'b-1',
  projectId: 'p-1',
  pondId: 'pond-1',
  stockingId: 's-1',
  speciesId: 'species-1',
  initialCount: 1000,
  cumulativeMortality: 0,
  harvestedCount: 0,
  latestAvgWeightG: null,
  status: 'ACTIVE',
  stockedOn: new Date('2026-01-01'),
  createdAt: new Date(),
});

function setup(overrides: { project?: Project | null; batch?: Batch | null } = {}) {
  const mortalities: jest.Mocked<MortalityRepositoryPort> = {
    findForProjectBetween: jest.fn().mockResolvedValue([]),
    findByClientMutationId: jest.fn().mockResolvedValue(null),
    findForBatchBetween: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation(async (m: Mortality) => m),
  };
  const batches: jest.Mocked<BatchRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.batch === undefined ? batch : overrides.batch),
    save: jest.fn(),
  };
  const projects: jest.Mocked<ProjectRepositoryPort> = {
    findAllActive: jest.fn(),
    findById: jest
      .fn()
      .mockResolvedValue(overrides.project === undefined ? project : overrides.project),
    findPage: jest.fn(),
    save: jest.fn(),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as DomainEventBus;
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'WORKER' } });

  const useCase = new LogMortalityUseCase(mortalities, batches, projects, events, tenant);
  return { useCase, mortalities, batches, projects, events };
}

describe('LogMortalityUseCase (TASK-028, CON-019, AC-094/095/100/105, R1/R6)', () => {
  it('AC-094: persists the mortality scoped to the project and emits MortalityRecorded (AC-095)', async () => {
    const { useCase, mortalities, events } = setup();

    const mortality = await useCase.execute('b-1', {
      count: 5,
      causeCategory: 'DISEASE',
      occurredAt: new Date('2026-02-01T10:00:00Z'),
      clientMutationId: 'cmid-1',
    });

    expect(mortality.projectId).toBe('p-1');
    expect(mortalities.save).toHaveBeenCalledTimes(1);
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'MortalityRecorded', batchId: 'b-1', count: 5 }),
    );
  });

  it('R1: a non-positive count is rejected', async () => {
    const { useCase, mortalities } = setup();
    await expect(
      useCase.execute('b-1', {
        count: 0,
        causeCategory: 'DISEASE',
        occurredAt: new Date('2026-02-01T10:00:00Z'),
        clientMutationId: 'cmid-1',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mortalities.save).not.toHaveBeenCalled();
  });

  it('AC-105: a batch from another project (or unknown) is not found, never disclosed', async () => {
    const { useCase, mortalities } = setup({ batch: null });
    await expect(
      useCase.execute('b-elsewhere', {
        count: 5,
        causeCategory: 'DISEASE',
        occurredAt: new Date('2026-02-01T10:00:00Z'),
        clientMutationId: 'cmid-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mortalities.save).not.toHaveBeenCalled();
  });

  it('R9: logging on a CLOSED project returns PROJECT_CLOSED', async () => {
    const closedProject = Project.reconstitute({ ...activeProjectProps, status: 'CLOSED' });
    const { useCase, mortalities } = setup({ project: closedProject });
    await expect(
      useCase.execute('b-1', {
        count: 5,
        causeCategory: 'DISEASE',
        occurredAt: new Date('2026-02-01T10:00:00Z'),
        clientMutationId: 'cmid-1',
      }),
    ).rejects.toBeInstanceOf(ProjectClosedError);
    expect(mortalities.save).not.toHaveBeenCalled();
  });

  it('ADR-010: a replayed clientMutationId is idempotent — returns the existing record, no re-emit', async () => {
    const existing = Mortality.reconstitute({
      id: 'm-existing',
      projectId: 'p-1',
      batchId: 'b-1',
      count: 5,
      causeCategory: 'DISEASE',
      photoUrl: null,
      occurredAt: new Date('2026-02-01T10:00:00Z'),
      clientMutationId: 'cmid-1',
      createdAt: new Date('2026-02-01T10:00:00Z'),
    });
    const { useCase, mortalities, events } = setup();
    mortalities.findByClientMutationId.mockResolvedValue(existing);

    const result = await useCase.execute('b-1', {
      count: 5,
      causeCategory: 'DISEASE',
      occurredAt: new Date('2026-02-01T10:00:00Z'),
      clientMutationId: 'cmid-1',
    });

    expect(result).toBe(existing);
    expect(mortalities.save).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('AC-100: emits AbnormalMortalityDetected when today spikes above the trailing baseline', async () => {
    const { useCase, mortalities, events } = setup();
    const trailing = Array.from({ length: 7 }, (_, i) => {
      const occurredAt = new Date('2026-02-01T10:00:00Z');
      occurredAt.setUTCDate(occurredAt.getUTCDate() - (i + 1));
      return Mortality.reconstitute({
        id: `m-${i}`,
        projectId: 'p-1',
        batchId: 'b-1',
        count: 1,
        causeCategory: 'DISEASE',
        photoUrl: null,
        occurredAt,
        clientMutationId: `cmid-trailing-${i}`,
        createdAt: occurredAt,
      });
    });
    // The repository query for spike detection runs after `save()`, so it must reflect the
    // just-persisted record too — mirroring what a real read-after-write repository would return.
    const todayRecord = Mortality.reconstitute({
      id: 'm-today',
      projectId: 'p-1',
      batchId: 'b-1',
      count: 50,
      causeCategory: 'DISEASE',
      photoUrl: null,
      occurredAt: new Date('2026-02-01T10:00:00Z'),
      clientMutationId: 'cmid-today',
      createdAt: new Date('2026-02-01T10:00:00Z'),
    });
    mortalities.findForBatchBetween.mockResolvedValue([...trailing, todayRecord]);

    await useCase.execute('b-1', {
      count: 50, // baseline = 1/day; 50 >> 1*3
      causeCategory: 'DISEASE',
      occurredAt: new Date('2026-02-01T10:00:00Z'),
      clientMutationId: 'cmid-today',
    });

    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'AbnormalMortalityDetected', projectId: 'p-1', sourceRef: 'b-1' }),
    );
  });

  it('does not emit AbnormalMortalityDetected when there is no established baseline', async () => {
    const { useCase, events } = setup();
    await useCase.execute('b-1', {
      count: 50,
      causeCategory: 'DISEASE',
      occurredAt: new Date('2026-02-01T10:00:00Z'),
      clientMutationId: 'cmid-today',
    });
    expect(events.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'AbnormalMortalityDetected' }),
    );
  });
});
