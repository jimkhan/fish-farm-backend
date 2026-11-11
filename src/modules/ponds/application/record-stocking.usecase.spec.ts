import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { Project } from '../../projects/domain/project.entity';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { ProjectRepositoryPort } from '../../projects/application/ports/project-repository.port';
import { Batch } from '../domain/batch.entity';
import { Pond } from '../domain/pond.entity';
import { Species } from '../domain/species.entity';
import { Stocking } from '../domain/stocking.entity';
import { RecordStockingUseCase } from './record-stocking.usecase';
import { BatchRepositoryPort } from './ports/batch-repository.port';
import { PondRepositoryPort } from './ports/pond-repository.port';
import { SpeciesRepositoryPort } from './ports/species-repository.port';
import { StockingRepositoryPort } from './ports/stocking-repository.port';

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

const golda = Species.reconstitute({
  id: 'species-1',
  name: 'SPF Golda',
  category: 'PRAWN',
  defaultDensityMin: null,
  defaultDensityMax: null,
});

function setup(
  overrides: { project?: Project | null; pond?: Pond | null; species?: Species[] } = {},
) {
  const ponds: jest.Mocked<PondRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn().mockResolvedValue(overrides.pond === undefined ? pond : overrides.pond),
    save: jest.fn(),
  };
  const species: jest.Mocked<SpeciesRepositoryPort> = {
    findAll: jest.fn().mockResolvedValue(overrides.species ?? [golda]),
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
  const stockings: jest.Mocked<StockingRepositoryPort> = {
    save: jest.fn().mockImplementation(async (s: Stocking) => s),
  };
  const batches: jest.Mocked<BatchRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findById: jest.fn(),
    save: jest.fn().mockImplementation(async (b: Batch) => b),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as DomainEventBus;
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'OWNER' } });

  const useCase = new RecordStockingUseCase(
    ponds,
    species,
    projects,
    stockings,
    batches,
    events,
    tenant,
  );
  return { useCase, ponds, species, projects, stockings, batches, events };
}

describe('RecordStockingUseCase (TASK-019, CON-015, AC-062/070, R2/R3/R7)', () => {
  it('AC-062: creates exactly one Batch with survivalEstimate = initialCount', async () => {
    const { useCase, batches } = setup();

    const batch = await useCase.execute('pond-1', {
      speciesId: 'species-1',
      count: 5000,
      stockedOn: new Date('2026-01-01'),
    });

    expect(batch.initialCount).toBe(5000);
    expect(batch.survivalEstimate).toBe(5000);
    expect(batches.save).toHaveBeenCalledTimes(1);
  });

  it('R3: links the batch to the stocking that created it', async () => {
    const { useCase, stockings } = setup();
    const batch = await useCase.execute('pond-1', {
      speciesId: 'species-1',
      count: 5000,
      stockedOn: new Date('2026-01-01'),
    });
    const savedStocking = (await stockings.save.mock.results[0].value) as Stocking;
    expect(batch.stockingId).toBe(savedStocking.id);
  });

  it('AC-070: stockingCostMinor is stored as an integer in BDT when given', async () => {
    const { useCase, stockings } = setup();
    await useCase.execute('pond-1', {
      speciesId: 'species-1',
      count: 5000,
      stockedOn: new Date('2026-01-01'),
      stockingCostMinor: 250000,
    });
    const saved = stockings.save.mock.calls[0][0] as Stocking;
    expect(saved.stockingCostMinor).toBe(250000);
    expect(saved.currency).toBe('BDT');
  });

  it('publishes StockingRecorded and BatchCreated', async () => {
    const { useCase, events } = setup();
    await useCase.execute('pond-1', {
      speciesId: 'species-1',
      count: 5000,
      stockedOn: new Date('2026-01-01'),
    });
    expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ name: 'StockingRecorded' }));
    expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ name: 'BatchCreated' }));
  });

  it('edge case 1: a pond in another project (or unknown) is not found', async () => {
    const { useCase, batches } = setup({ pond: null });
    await expect(
      useCase.execute('pond-elsewhere', {
        speciesId: 'species-1',
        count: 5000,
        stockedOn: new Date('2026-01-01'),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(batches.save).not.toHaveBeenCalled();
  });

  it('R2: an unknown speciesId is rejected', async () => {
    const { useCase } = setup({ species: [] });
    await expect(
      useCase.execute('pond-1', {
        speciesId: 'species-unknown',
        count: 5000,
        stockedOn: new Date('2026-01-01'),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('R2: a non-positive count is rejected', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute('pond-1', {
        speciesId: 'species-1',
        count: 0,
        stockedOn: new Date('2026-01-01'),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('R7: stocking on a CLOSED project returns PROJECT_CLOSED', async () => {
    const closedProject = Project.reconstitute({ ...activeProjectProps, status: 'CLOSED' });
    const { useCase, batches } = setup({ project: closedProject });
    await expect(
      useCase.execute('pond-1', {
        speciesId: 'species-1',
        count: 5000,
        stockedOn: new Date('2026-01-01'),
      }),
    ).rejects.toBeInstanceOf(ProjectClosedError);
    expect(batches.save).not.toHaveBeenCalled();
  });
});
