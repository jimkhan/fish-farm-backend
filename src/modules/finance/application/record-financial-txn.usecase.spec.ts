import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { ProjectRepositoryPort } from '../../projects/application/ports/project-repository.port';
import { Project } from '../../projects/domain/project.entity';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { FinancialTxnRepositoryPort } from './ports/financial-txn-repository.port';
import { RecordFinancialTxnUseCase } from './record-financial-txn.usecase';

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
  const txns: jest.Mocked<FinancialTxnRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    save: jest.fn().mockImplementation((t) => Promise.resolve(t)),
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

  const useCase = new RecordFinancialTxnUseCase(txns, projects, tenant);
  return { useCase, txns, projects };
}

describe('RecordFinancialTxnUseCase (TASK-032, CON-033, F1, AC-107/116, R1/R2/R9)', () => {
  it('AC-107/116: records a cost as integer minor units', async () => {
    const { useCase } = setup();
    const txn = await useCase.execute({
      kind: 'COST',
      category: 'FEED',
      amountMinor: 150000,
      occurredOn: new Date('2026-02-01'),
    });
    expect(txn.amountMinor).toBe(150000);
    expect(txn.kind).toBe('COST');
    expect(txn.category).toBe('FEED');
    expect(txn.sourceRef).toBeNull();
  });

  it('records a HARVEST revenue with an optional note and sourceRef', async () => {
    const { useCase } = setup();
    const txn = await useCase.execute({
      kind: 'REVENUE',
      category: 'HARVEST',
      amountMinor: 500000,
      occurredOn: new Date('2026-02-01'),
      sourceRef: 'harvest-1',
      note: 'Local market sale',
    });
    expect(txn.sourceRef).toBe('harvest-1');
    expect(txn.note).toBe('Local market sale');
  });

  it('R2: rejects a mismatched kind/category combination', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({
        kind: 'COST',
        category: 'HARVEST',
        amountMinor: 1000,
        occurredOn: new Date(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      useCase.execute({
        kind: 'REVENUE',
        category: 'FEED',
        amountMinor: 1000,
        occurredOn: new Date(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a non-positive amount', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({ kind: 'COST', category: 'FEED', amountMinor: 0, occurredOn: new Date() }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('the project must exist', async () => {
    const { useCase } = setup({ project: null });
    await expect(
      useCase.execute({ kind: 'COST', category: 'FEED', amountMinor: 1000, occurredOn: new Date() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('R9: rejects a write on a CLOSED project', async () => {
    const closedProject = Project.reconstitute({ ...activeProjectProps, status: 'CLOSED' });
    const { useCase } = setup({ project: closedProject });
    await expect(
      useCase.execute({ kind: 'COST', category: 'FEED', amountMinor: 1000, occurredOn: new Date() }),
    ).rejects.toBeInstanceOf(ProjectClosedError);
  });
});
