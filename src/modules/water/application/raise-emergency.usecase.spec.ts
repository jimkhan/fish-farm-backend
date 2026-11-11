import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { Alert } from '../../notifications/domain/alert.entity';
import { AlertRepositoryPort } from '../../notifications/application/ports/alert-repository.port';
import { PondRepositoryPort } from '../../ponds/application/ports/pond-repository.port';
import { Pond } from '../../ponds/domain/pond.entity';
import { ProjectRepositoryPort } from '../../projects/application/ports/project-repository.port';
import { Project } from '../../projects/domain/project.entity';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { RaiseEmergencyUseCase } from './raise-emergency.usecase';

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

const pond = Pond.reconstitute({
  id: 'pond-1',
  projectId: 'p-1',
  name: 'North Pond',
  area: 10,
  depthM: null,
  notes: null,
  createdAt: new Date(),
});

function resultingAlert(overrides: Partial<Parameters<typeof Alert.reconstitute>[0]> = {}) {
  return Alert.reconstitute({
    id: 'a-1',
    projectId: 'p-1',
    type: 'WATER_EMERGENCY',
    severity: 'CRITICAL',
    state: 'SENT',
    message: 'Emergency raised by a worker — no additional details provided.',
    sourceRef: 'pond-1',
    raisedAt: new Date(),
    acknowledgedAt: null,
    resolvedAt: null,
    escalatedAt: null,
    ...overrides,
  });
}

function setup(
  overrides: {
    project?: Project | null;
    pond?: Pond | null;
    alertAfterPublish?: Alert | null;
  } = {},
) {
  const ponds: jest.Mocked<PondRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.pond === undefined ? pond : overrides.pond),
    save: jest.fn(),
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
  const alerts: jest.Mocked<AlertRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn(),
    findByDedupKey: jest
      .fn()
      .mockResolvedValue(overrides.alertAfterPublish === undefined ? resultingAlert() : overrides.alertAfterPublish),
    save: jest.fn(),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as DomainEventBus;
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'WORKER' } });

  const useCase = new RaiseEmergencyUseCase(ponds, projects, alerts, events, tenant);
  return { useCase, ponds, projects, alerts, events };
}

describe('RaiseEmergencyUseCase (TASK-024, CON-028, AC-086, R4/R8)', () => {
  it('AC-086: publishes WaterEmergencyRaised with the pond as sourceRef and returns the resulting CRITICAL alert', async () => {
    const { useCase, events } = setup();
    const alert = await useCase.execute({ pondId: 'pond-1', note: 'DO crashing fast' });

    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'WaterEmergencyRaised',
        projectId: 'p-1',
        sourceRef: 'pond-1',
        message: 'DO crashing fast',
      }),
    );
    expect(alert.severity).toBe('CRITICAL');
    expect(alert.type).toBe('WATER_EMERGENCY');
  });

  it('edge case 3: works with no pond and no note — projectId becomes sourceRef, a default message is used', async () => {
    const { useCase, events, alerts } = setup({
      alertAfterPublish: resultingAlert({ sourceRef: 'p-1' }),
    });
    await useCase.execute({});

    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRef: 'p-1',
        message: 'Emergency raised by a worker — no additional details provided.',
      }),
    );
    expect(alerts.findByDedupKey).toHaveBeenCalledWith('p-1:WATER_EMERGENCY:p-1');
  });

  it('a pond from another project (or unknown) is not found', async () => {
    const { useCase, events } = setup({ pond: null });
    await expect(useCase.execute({ pondId: 'pond-elsewhere' })).rejects.toBeInstanceOf(NotFoundError);
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('the project must exist', async () => {
    const { useCase } = setup({ project: null });
    await expect(useCase.execute({})).rejects.toBeInstanceOf(NotFoundError);
  });

  it('R8: raising an emergency on a CLOSED project returns PROJECT_CLOSED', async () => {
    const closedProject = Project.reconstitute({ ...activeProjectProps, status: 'CLOSED' });
    const { useCase, events } = setup({ project: closedProject });
    await expect(useCase.execute({})).rejects.toBeInstanceOf(ProjectClosedError);
    expect(events.publish).not.toHaveBeenCalled();
  });
});
