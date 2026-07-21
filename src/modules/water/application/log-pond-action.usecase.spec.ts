import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { PondRepositoryPort } from '../../ponds/application/ports/pond-repository.port';
import { Pond } from '../../ponds/domain/pond.entity';
import { ProjectRepositoryPort } from '../../projects/application/ports/project-repository.port';
import { Project } from '../../projects/domain/project.entity';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { PondAction } from '../domain/pond-action.entity';
import { LogPondActionUseCase } from './log-pond-action.usecase';
import { PondActionRepositoryPort } from './ports/pond-action-repository.port';

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

function setup(overrides: { project?: Project | null; pond?: Pond | null } = {}) {
  const pondActions: jest.Mocked<PondActionRepositoryPort> = {
    findByClientMutationId: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockImplementation(async (a: PondAction) => a),
  };
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
    findPage: jest.fn(),
    save: jest.fn(),
  };
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'WORKER' } });

  const useCase = new LogPondActionUseCase(pondActions, ponds, projects, tenant);
  return { useCase, pondActions, ponds, projects };
}

describe('LogPondActionUseCase (TASK-025, MOD-06 F4, AC-088)', () => {
  it('AC-088: records a CHAIN_DRAG action tied to the pond', async () => {
    const { useCase, pondActions } = setup();
    const action = await useCase.execute('pond-1', {
      actionType: 'CHAIN_DRAG',
      performedAt: new Date('2026-02-01T10:00:00Z'),
      notes: 'Bottom looked clean',
      clientMutationId: 'cmid-1',
    });
    expect(action.projectId).toBe('p-1');
    expect(action.pondId).toBe('pond-1');
    expect(action.actionType).toBe('CHAIN_DRAG');
    expect(action.notes).toBe('Bottom looked clean');
    expect(pondActions.save).toHaveBeenCalledTimes(1);
  });

  it('AC-088: records an AERATION action with no notes as null', async () => {
    const { useCase } = setup();
    const action = await useCase.execute('pond-1', {
      actionType: 'AERATION',
      performedAt: new Date('2026-02-01T10:00:00Z'),
      clientMutationId: 'cmid-1',
    });
    expect(action.actionType).toBe('AERATION');
    expect(action.notes).toBeNull();
  });

  it('ADR-010: a replayed clientMutationId is idempotent', async () => {
    const existing = PondAction.reconstitute({
      id: 'a-existing',
      projectId: 'p-1',
      pondId: 'pond-1',
      actionType: 'CHAIN_DRAG',
      performedAt: new Date('2026-02-01T10:00:00Z'),
      notes: null,
      clientMutationId: 'cmid-1',
      createdAt: new Date(),
    });
    const { useCase, pondActions } = setup();
    pondActions.findByClientMutationId.mockResolvedValue(existing);

    const result = await useCase.execute('pond-1', {
      actionType: 'CHAIN_DRAG',
      performedAt: new Date('2026-02-01T10:00:00Z'),
      clientMutationId: 'cmid-1',
    });
    expect(result).toBe(existing);
    expect(pondActions.save).not.toHaveBeenCalled();
  });

  it('a pond from another project (or unknown) is not found', async () => {
    const { useCase, pondActions } = setup({ pond: null });
    await expect(
      useCase.execute('pond-elsewhere', {
        actionType: 'CHAIN_DRAG',
        performedAt: new Date('2026-02-01T10:00:00Z'),
        clientMutationId: 'cmid-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(pondActions.save).not.toHaveBeenCalled();
  });

  it('a CLOSED project rejects with PROJECT_CLOSED', async () => {
    const closedProject = Project.reconstitute({ ...activeProjectProps, status: 'CLOSED' });
    const { useCase } = setup({ project: closedProject });
    await expect(
      useCase.execute('pond-1', {
        actionType: 'CHAIN_DRAG',
        performedAt: new Date('2026-02-01T10:00:00Z'),
        clientMutationId: 'cmid-1',
      }),
    ).rejects.toBeInstanceOf(ProjectClosedError);
  });
});
