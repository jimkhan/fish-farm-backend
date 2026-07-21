import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { ProjectRepositoryPort } from '../../projects/application/ports/project-repository.port';
import { Project } from '../../projects/domain/project.entity';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { InventoryItem } from '../domain/inventory-item.entity';
import { CreateInventoryItemUseCase } from './create-item.usecase';
import { InventoryItemRepositoryPort } from './ports/inventory-item-repository.port';

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

function setup(overrides: { project?: Project | null } = {}) {
  const items: jest.Mocked<InventoryItemRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn(),
    save: jest.fn().mockImplementation(async (i: InventoryItem) => i),
  };
  const projects: jest.Mocked<ProjectRepositoryPort> = {
    findAllActive: jest.fn(),
    findById: jest
      .fn()
      .mockResolvedValue(overrides.project === undefined ? project : overrides.project),
    findPage: jest.fn(),
    save: jest.fn(),
  };
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'OWNER' } });

  const useCase = new CreateInventoryItemUseCase(items, projects, tenant);
  return { useCase, items, projects };
}

describe('CreateInventoryItemUseCase (TASK-020, CON-023, AC-078, R7/R9)', () => {
  it('creates an item scoped to the project starting at quantity 0', async () => {
    const { useCase, items } = setup();
    const item = await useCase.execute({ name: 'Floating Pellets', feedType: 'FLOATING', unit: 'kg', lowStockThreshold: 20 });

    expect(item.projectId).toBe('p-1');
    expect(item.quantity).toBe(0);
    expect(item.lowStockThreshold).toBe(20);
    expect(items.save).toHaveBeenCalledTimes(1);
  });

  it('a negative lowStockThreshold is rejected', async () => {
    const { useCase, items } = setup();
    await expect(
      useCase.execute({ name: 'Pellets', unit: 'kg', lowStockThreshold: -1 }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(items.save).not.toHaveBeenCalled();
  });

  it('the project must exist', async () => {
    const { useCase } = setup({ project: null });
    await expect(useCase.execute({ name: 'Pellets', unit: 'kg' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('R9: creating on a CLOSED project returns PROJECT_CLOSED', async () => {
    const closedProject = Project.reconstitute({ ...activeProjectProps, status: 'CLOSED' });
    const { useCase, items } = setup({ project: closedProject });
    await expect(useCase.execute({ name: 'Pellets', unit: 'kg' })).rejects.toBeInstanceOf(
      ProjectClosedError,
    );
    expect(items.save).not.toHaveBeenCalled();
  });
});
