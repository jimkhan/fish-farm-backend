import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { InitialOwnerMembershipPort } from '../../identity/application/ports/initial-owner-membership.port';
import { Project } from '../domain/project.entity';
import { ProvisionFirstPondPort } from '../domain/provision-first-pond.port';
import { CreateProjectUseCase } from './create-project.usecase';
import { ProjectRepositoryPort } from './ports/project-repository.port';

function setup(overrides: { provisionFirstPond?: ProvisionFirstPondPort | null } = {}) {
  const projects: jest.Mocked<ProjectRepositoryPort> = {
    findAllActive: jest.fn(),
    findById: jest.fn(),
    findByIds: jest.fn().mockResolvedValue([]),
    findPage: jest.fn(),
    save: jest.fn().mockImplementation(async (p: Project) => p),
  };
  const ownerMembership: jest.Mocked<InitialOwnerMembershipPort> = {
    createForNewProject: jest.fn().mockResolvedValue(undefined),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as DomainEventBus;
  const provisionFirstPond: jest.Mocked<ProvisionFirstPondPort> | null =
    overrides.provisionFirstPond === undefined
      ? { create: jest.fn().mockResolvedValue(undefined) }
      : (overrides.provisionFirstPond as jest.Mocked<ProvisionFirstPondPort> | null);

  const useCase = new CreateProjectUseCase(projects, ownerMembership, events, provisionFirstPond);
  return { useCase, projects, ownerMembership, events, provisionFirstPond };
}

describe('CreateProjectUseCase (TASK-011, CON-007, AC-030)', () => {
  it('AC-030: persists the project and creates the creator\'s OWNER membership', async () => {
    const { useCase, projects, ownerMembership } = setup();

    const project = await useCase.execute('user-1', {
      name: 'North Pond Farm',
      siteLat: 23.81,
      siteLng: 90.41,
    });

    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(ownerMembership.createForNewProject).toHaveBeenCalledWith('user-1', project.id);
    expect(project.status).toBe('ACTIVE');
  });

  it('ADR-018: currency is always BDT, regardless of any client-influenced input', async () => {
    const { useCase } = setup();
    const project = await useCase.execute('user-1', {
      name: 'North Pond Farm',
      siteLat: 23.81,
      siteLng: 90.41,
    });
    expect(project.currency).toBe('BDT');
  });

  it('defaults landUnit to BIGHA when not given (ADR-018)', async () => {
    const { useCase } = setup();
    const project = await useCase.execute('user-1', {
      name: 'North Pond Farm',
      siteLat: 23.81,
      siteLng: 90.41,
    });
    expect(project.landUnit).toBe('BIGHA');
  });

  it('publishes ProjectCreated with the owner id', async () => {
    const { useCase, events } = setup();
    const project = await useCase.execute('user-1', {
      name: 'North Pond Farm',
      siteLat: 23.81,
      siteLng: 90.41,
    });
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ProjectCreated', projectId: project.id, ownerId: 'user-1' }),
    );
  });

  describe('AC-032/068: inline first-pond (TASK-018)', () => {
    it('calls ProvisionFirstPondPort.create with the new project id when firstPond is given', async () => {
      const { useCase, provisionFirstPond } = setup();
      const project = await useCase.execute('user-1', {
        name: 'North Pond Farm',
        siteLat: 23.81,
        siteLng: 90.41,
        firstPond: { name: 'First Pond', area: 10 },
      });
      expect(provisionFirstPond?.create).toHaveBeenCalledWith(project.id, {
        name: 'First Pond',
        area: 10,
      });
    });

    it('does not call ProvisionFirstPondPort when firstPond is omitted', async () => {
      const { useCase, provisionFirstPond } = setup();
      await useCase.execute('user-1', { name: 'No Pond Farm', siteLat: 23.81, siteLng: 90.41 });
      expect(provisionFirstPond?.create).not.toHaveBeenCalled();
    });

    it('fails closed if firstPond is given but no adapter is bound (pre-TASK-018 defensive path)', async () => {
      const { useCase } = setup({ provisionFirstPond: null });
      await expect(
        useCase.execute('user-1', {
          name: 'North Pond Farm',
          siteLat: 23.81,
          siteLng: 90.41,
          firstPond: { name: 'First Pond', area: 10 },
        }),
      ).rejects.toThrow();
    });
  });
});
