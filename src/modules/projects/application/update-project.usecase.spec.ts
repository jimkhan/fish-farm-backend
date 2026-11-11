import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { Project } from '../domain/project.entity';
import { ProjectClosedError } from '../domain/project-errors';
import { UpdateProjectUseCase } from './update-project.usecase';
import { ProjectRepositoryPort } from './ports/project-repository.port';

function projectFixture(overrides: Partial<Parameters<typeof Project.reconstitute>[0]> = {}) {
  return Project.reconstitute({
    id: 'p-1',
    name: 'North Pond Farm',
    siteLat: 23.81,
    siteLng: 90.41,
    address: 'Dhaka',
    currency: 'BDT',
    landUnit: 'BIGHA',
    status: 'ACTIVE',
    createdAt: new Date(),
    ...overrides,
  });
}

function setup(overrides: { project?: Project | null } = {}) {
  const projects: jest.Mocked<ProjectRepositoryPort> = {
    findAllActive: jest.fn(),
    findById: jest
      .fn()
      .mockResolvedValue(overrides.project === undefined ? projectFixture() : overrides.project),
    findByIds: jest.fn().mockResolvedValue([]),
    findPage: jest.fn(),
    save: jest.fn().mockImplementation(async (p: Project) => p),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as DomainEventBus;
  const tenant = new TenantContext({ tenant: { userId: 'owner-1', projectId: 'p-1', role: 'OWNER' } });

  const useCase = new UpdateProjectUseCase(projects, events, tenant);
  return { useCase, projects, events };
}

describe('UpdateProjectUseCase (TASK-011, CON-009, AC-036, R4)', () => {
  it('updates name/address on an ACTIVE project', async () => {
    const { useCase, projects } = setup();
    const updated = await useCase.execute({ name: 'Renamed Farm' });
    expect(updated.name).toBe('Renamed Farm');
    expect(projects.save).toHaveBeenCalledTimes(1);
  });

  it('AC-036: any field write on a CLOSED project is rejected with PROJECT_CLOSED', async () => {
    const { useCase, projects } = setup({ project: projectFixture({ status: 'CLOSED' }) });
    await expect(useCase.execute({ name: 'Renamed Farm' })).rejects.toBeInstanceOf(
      ProjectClosedError,
    );
    expect(projects.save).not.toHaveBeenCalled();
  });

  it('reopening a CLOSED project (status: ACTIVE alone) is allowed', async () => {
    const { useCase, projects } = setup({ project: projectFixture({ status: 'CLOSED' }) });
    const updated = await useCase.execute({ status: 'ACTIVE' });
    expect(updated.status).toBe('ACTIVE');
    expect(projects.save).toHaveBeenCalledTimes(1);
  });

  it('reopening combined with another field change is rejected (strict reopen-only exception)', async () => {
    const { useCase, projects } = setup({ project: projectFixture({ status: 'CLOSED' }) });
    await expect(
      useCase.execute({ status: 'ACTIVE', name: 'Renamed Farm' }),
    ).rejects.toBeInstanceOf(ProjectClosedError);
    expect(projects.save).not.toHaveBeenCalled();
  });

  it('re-closing an already-CLOSED project is rejected too (no redundant no-op writes)', async () => {
    const { useCase, projects } = setup({ project: projectFixture({ status: 'CLOSED' }) });
    await expect(useCase.execute({ status: 'CLOSED' })).rejects.toBeInstanceOf(ProjectClosedError);
    expect(projects.save).not.toHaveBeenCalled();
  });

  it('publishes ProjectClosed when transitioning ACTIVE → CLOSED', async () => {
    const { useCase, events } = setup({ project: projectFixture({ status: 'ACTIVE' }) });
    await useCase.execute({ status: 'CLOSED' });
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ProjectClosed', projectId: 'p-1' }),
    );
  });

  it('an unknown project throws NotFoundError', async () => {
    const { useCase } = setup({ project: null });
    await expect(useCase.execute({ name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
