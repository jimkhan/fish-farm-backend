import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import { Batch } from '../../ponds/domain/batch.entity';
import { ProjectRepositoryPort } from '../../projects/application/ports/project-repository.port';
import { Project } from '../../projects/domain/project.entity';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { Sampling } from '../domain/sampling.entity';
import { RecordSamplingUseCase } from './record-sampling.usecase';
import { SamplingRepositoryPort } from './ports/sampling-repository.port';

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
  const samplings: jest.Mocked<SamplingRepositoryPort> = {
    findForBatch: jest.fn(),
    findByClientMutationId: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockImplementation(async (s: Sampling) => s),
  };
  const batches: jest.Mocked<BatchRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.batch === undefined ? batch : overrides.batch),
    save: jest.fn(),
  };
  const projects: jest.Mocked<ProjectRepositoryPort> = {
    findByIds: jest.fn().mockResolvedValue([]),
    findAllActive: jest.fn(),
    findById: jest
      .fn()
      .mockResolvedValue(overrides.project === undefined ? project : overrides.project),
    findPage: jest.fn(),
    save: jest.fn(),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as DomainEventBus;
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'WORKER' } });

  const useCase = new RecordSamplingUseCase(samplings, batches, projects, events, tenant);
  return { useCase, samplings, batches, projects, events };
}

describe('RecordSamplingUseCase (TASK-029, CON-020, AC-096, R2/R9)', () => {
  it('AC-096: persists the sampling scoped and emits SamplingRecorded', async () => {
    const { useCase, samplings, events } = setup();
    const sampling = await useCase.execute('b-1', {
      sampleSize: 30,
      avgWeightG: 15,
      sampledOn: new Date('2026-02-01'),
      clientMutationId: 'cmid-1',
    });
    expect(sampling.projectId).toBe('p-1');
    expect(samplings.save).toHaveBeenCalledTimes(1);
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'SamplingRecorded', batchId: 'b-1', avgWeightG: 15 }),
    );
  });

  it('R2: a non-positive sampleSize or avgWeightG is rejected', async () => {
    const { useCase, samplings } = setup();
    await expect(
      useCase.execute('b-1', {
        sampleSize: 0,
        avgWeightG: 15,
        sampledOn: new Date('2026-02-01'),
        clientMutationId: 'cmid-1',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      useCase.execute('b-1', {
        sampleSize: 30,
        avgWeightG: 0,
        sampledOn: new Date('2026-02-01'),
        clientMutationId: 'cmid-2',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(samplings.save).not.toHaveBeenCalled();
  });

  it('a batch from another project (or unknown) is not found', async () => {
    const { useCase, samplings } = setup({ batch: null });
    await expect(
      useCase.execute('b-elsewhere', {
        sampleSize: 30,
        avgWeightG: 15,
        sampledOn: new Date('2026-02-01'),
        clientMutationId: 'cmid-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(samplings.save).not.toHaveBeenCalled();
  });

  it('R9: recording on a CLOSED project returns PROJECT_CLOSED', async () => {
    const closedProject = Project.reconstitute({ ...activeProjectProps, status: 'CLOSED' });
    const { useCase, samplings } = setup({ project: closedProject });
    await expect(
      useCase.execute('b-1', {
        sampleSize: 30,
        avgWeightG: 15,
        sampledOn: new Date('2026-02-01'),
        clientMutationId: 'cmid-1',
      }),
    ).rejects.toBeInstanceOf(ProjectClosedError);
    expect(samplings.save).not.toHaveBeenCalled();
  });

  it('ADR-010: a replayed clientMutationId is idempotent — no duplicate, no re-emit', async () => {
    const existing = Sampling.reconstitute({
      id: 's-existing',
      projectId: 'p-1',
      batchId: 'b-1',
      sampleSize: 30,
      avgWeightG: 15,
      sampledOn: new Date('2026-02-01'),
      clientMutationId: 'cmid-1',
      createdAt: new Date(),
    });
    const { useCase, samplings, events } = setup();
    samplings.findByClientMutationId.mockResolvedValue(existing);

    const result = await useCase.execute('b-1', {
      sampleSize: 30,
      avgWeightG: 15,
      sampledOn: new Date('2026-02-01'),
      clientMutationId: 'cmid-1',
    });
    expect(result).toBe(existing);
    expect(samplings.save).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });
});
