import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { ProjectRepositoryPort } from '../../projects/application/ports/project-repository.port';
import { Project } from '../../projects/domain/project.entity';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { WaterThreshold } from '../domain/water-threshold.entity';
import { ConfigureThresholdsUseCase } from './configure-thresholds.usecase';
import { WaterThresholdRepositoryPort } from './ports/water-threshold-repository.port';

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

function setup(overrides: { project?: Project | null; existing?: WaterThreshold | null } = {}) {
  const thresholds: jest.Mocked<WaterThresholdRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findByParameter: jest
      .fn()
      .mockResolvedValue(overrides.existing === undefined ? null : overrides.existing),
    save: jest.fn().mockImplementation(async (t: WaterThreshold) => t),
  };
  const projects: jest.Mocked<ProjectRepositoryPort> = {
    findAllActive: jest.fn(),
    findById: jest
      .fn()
      .mockResolvedValue(overrides.project === undefined ? project : overrides.project),
    findByIds: jest.fn().mockResolvedValue([]),
    findPage: jest.fn(),
    save: jest.fn(),
  };
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'OWNER' } });

  const useCase = new ConfigureThresholdsUseCase(thresholds, projects, tenant);
  return { useCase, thresholds, projects };
}

describe('ConfigureThresholdsUseCase (TASK-023, CON-027, AC-085, R2/R8/R9)', () => {
  it('upserts a new threshold row scoped to the project', async () => {
    const { useCase, thresholds } = setup();
    const [saved] = await useCase.execute([{ parameter: 'DO', min: 5, max: null, critical: 3 }]);
    expect(saved.projectId).toBe('p-1');
    expect(saved.min).toBe(5);
    expect(thresholds.save).toHaveBeenCalledTimes(1);
  });

  it('reuses the existing row id when a parameter is already configured (true update)', async () => {
    const existing = WaterThreshold.reconstitute({
      id: 't-existing',
      projectId: 'p-1',
      parameter: 'DO',
      min: 4,
      max: null,
      critical: 3,
    });
    const { useCase } = setup({ existing });
    const [saved] = await useCase.execute([{ parameter: 'DO', min: 6, max: null, critical: 5 }]);
    expect(saved.id).toBe('t-existing');
    expect(saved.min).toBe(6);
  });

  it('requires at least a min or a max bound', async () => {
    const { useCase, thresholds } = setup();
    await expect(
      useCase.execute([{ parameter: 'DO', min: null, max: null, critical: null }]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(thresholds.save).not.toHaveBeenCalled();
  });

  it('the project must exist', async () => {
    const { useCase } = setup({ project: null });
    await expect(
      useCase.execute([{ parameter: 'DO', min: 4, max: null, critical: 3 }]),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('R8/AC-093: a CLOSED project rejects with PROJECT_CLOSED', async () => {
    const closedProject = Project.reconstitute({ ...activeProjectProps, status: 'CLOSED' });
    const { useCase, thresholds } = setup({ project: closedProject });
    await expect(
      useCase.execute([{ parameter: 'DO', min: 4, max: null, critical: 3 }]),
    ).rejects.toBeInstanceOf(ProjectClosedError);
    expect(thresholds.save).not.toHaveBeenCalled();
  });
});
