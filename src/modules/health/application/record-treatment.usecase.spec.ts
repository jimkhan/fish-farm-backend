import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { BatchRepositoryPort } from '../../ponds/application/ports/batch-repository.port';
import { Batch } from '../../ponds/domain/batch.entity';
import { ProjectRepositoryPort } from '../../projects/application/ports/project-repository.port';
import { Project } from '../../projects/domain/project.entity';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { Treatment } from '../domain/treatment.entity';
import { RecordTreatmentUseCase } from './record-treatment.usecase';
import { TreatmentRepositoryPort } from './ports/treatment-repository.port';

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
  const treatments: jest.Mocked<TreatmentRepositoryPort> = {
    findAllForBatch: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation(async (t: Treatment) => t),
  };
  const batches: jest.Mocked<BatchRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.batch === undefined ? batch : overrides.batch),
    save: jest.fn(),
  };
  const projects: jest.Mocked<ProjectRepositoryPort> = {
    findById: jest
      .fn()
      .mockResolvedValue(overrides.project === undefined ? project : overrides.project),
    findPage: jest.fn(),
    save: jest.fn(),
  };
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'OWNER' } });

  const useCase = new RecordTreatmentUseCase(treatments, batches, projects, tenant);
  return { useCase, treatments, batches, projects };
}

describe('RecordTreatmentUseCase (TASK-028, CON-051, AC-101, R7)', () => {
  it('persists a treatment scoped to the project with the withdrawal window', async () => {
    const { useCase, treatments } = setup();
    const treatment = await useCase.execute('b-1', {
      product: 'Oxytetracycline',
      dose: '50mg/kg',
      administeredOn: new Date('2026-01-01'),
      withdrawalDays: 14,
    });

    expect(treatment.projectId).toBe('p-1');
    expect(treatment.batchId).toBe('b-1');
    expect(treatment.withdrawalDays).toBe(14);
    expect(treatments.save).toHaveBeenCalledTimes(1);
  });

  it('a negative withdrawalDays is rejected', async () => {
    const { useCase, treatments } = setup();
    await expect(
      useCase.execute('b-1', {
        product: 'Oxytetracycline',
        dose: '50mg/kg',
        administeredOn: new Date('2026-01-01'),
        withdrawalDays: -1,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(treatments.save).not.toHaveBeenCalled();
  });

  it('a batch from another project (or unknown) is not found', async () => {
    const { useCase, treatments } = setup({ batch: null });
    await expect(
      useCase.execute('b-elsewhere', {
        product: 'Oxytetracycline',
        dose: '50mg/kg',
        administeredOn: new Date('2026-01-01'),
        withdrawalDays: 14,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(treatments.save).not.toHaveBeenCalled();
  });

  it('R9: recording on a CLOSED project returns PROJECT_CLOSED', async () => {
    const closedProject = Project.reconstitute({ ...activeProjectProps, status: 'CLOSED' });
    const { useCase, treatments } = setup({ project: closedProject });
    await expect(
      useCase.execute('b-1', {
        product: 'Oxytetracycline',
        dose: '50mg/kg',
        administeredOn: new Date('2026-01-01'),
        withdrawalDays: 14,
      }),
    ).rejects.toBeInstanceOf(ProjectClosedError);
    expect(treatments.save).not.toHaveBeenCalled();
  });
});
