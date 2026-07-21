import { ProjectMembership } from '../../identity/domain/project-membership.entity';
import { MembershipDirectoryPort } from '../../identity/application/ports/membership-directory.port';
import { Project } from '../domain/project.entity';
import { PortfolioAlertsPort } from '../domain/portfolio-alerts.port';
import { PortfolioBiomassPort } from '../domain/portfolio-biomass.port';
import { PortfolioFinancePort } from '../domain/portfolio-finance.port';
import { PortfolioSummaryUseCase } from './portfolio-summary.usecase';
import { ProjectRepositoryPort } from './ports/project-repository.port';

function membership(projectId: string, role: 'OWNER' | 'WORKER' | 'PARTNER') {
  return ProjectMembership.reconstitute({
    id: `m-${projectId}`,
    userId: 'u-1',
    projectId,
    role,
    status: 'ACTIVE',
    createdAt: new Date(),
  });
}

function projectFixture(id: string, name: string) {
  return Project.reconstitute({
    id,
    name,
    siteLat: 23.8,
    siteLng: 90.4,
    address: null,
    currency: 'BDT',
    landUnit: 'BIGHA',
    status: 'ACTIVE',
    createdAt: new Date(),
  });
}

function setup(overrides: {
  memberships?: ProjectMembership[];
  biomassByProject?: Record<string, number>;
  alertsByProject?: Record<string, number>;
  netProfitByProject?: Record<string, number>;
} = {}) {
  const memberships: jest.Mocked<MembershipDirectoryPort> = {
    findActiveByUserId: jest
      .fn()
      .mockResolvedValue(overrides.memberships ?? [membership('p-a', 'OWNER'), membership('p-b', 'OWNER')]),
  };
  const projects: jest.Mocked<ProjectRepositoryPort> = {
    findAllActive: jest.fn(),
    findById: jest.fn().mockImplementation(async (id: string) => projectFixture(id, `Project ${id}`)),
    findPage: jest.fn(),
    save: jest.fn(),
  };
  const biomass: jest.Mocked<PortfolioBiomassPort> = {
    getTotalBiomassKg: jest
      .fn()
      .mockImplementation(async (id: string) => overrides.biomassByProject?.[id] ?? 0),
  };
  const alerts: jest.Mocked<PortfolioAlertsPort> = {
    countOpenCritical: jest
      .fn()
      .mockImplementation(async (id: string) => overrides.alertsByProject?.[id] ?? 0),
  };
  const finance: jest.Mocked<PortfolioFinancePort> = {
    getNetProfitMinor: jest
      .fn()
      .mockImplementation(async (id: string) => overrides.netProfitByProject?.[id] ?? 0),
  };

  const useCase = new PortfolioSummaryUseCase(memberships, projects, biomass, alerts, finance);
  return { useCase, memberships, projects, biomass, alerts, finance };
}

describe('PortfolioSummaryUseCase (TASK-012/033, CON-035, AC-034/035/112, R5/R8)', () => {
  it('AC-034: aggregates biomass/alerts for A and B (owned) only, never a project the caller only partners on', async () => {
    const { useCase } = setup({
      memberships: [membership('p-a', 'OWNER'), membership('p-b', 'OWNER'), membership('p-c', 'PARTNER')],
      biomassByProject: { 'p-a': 100, 'p-b': 50 },
      alertsByProject: { 'p-a': 2, 'p-b': 1 },
    });

    const result = await useCase.execute('u-1');

    expect(result.projects.map((p) => p.projectId).sort()).toEqual(['p-a', 'p-b']);
    expect(result.totalBiomassKg).toBe(150);
    expect(result.openCriticalAlerts).toBe(3);
  });

  it('AC-035: a pure Partner/Worker (owner of nothing) gets a valid, empty portfolio — no leakage', async () => {
    const { useCase, biomass, alerts, finance } = setup({
      memberships: [membership('p-a', 'PARTNER'), membership('p-b', 'WORKER')],
    });

    const result = await useCase.execute('u-1');

    expect(result.projects).toEqual([]);
    expect(result.totalBiomassKg).toBe(0);
    expect(result.openCriticalAlerts).toBe(0);
    expect(result.netProfitMinor).toBe(0);
    expect(biomass.getTotalBiomassKg).not.toHaveBeenCalled();
    expect(alerts.countOpenCritical).not.toHaveBeenCalled();
    expect(finance.getNetProfitMinor).not.toHaveBeenCalled();
  });

  it('AC-112: sums real net profit (BDT) across owned projects only', async () => {
    const { useCase } = setup({
      memberships: [membership('p-a', 'OWNER'), membership('p-b', 'OWNER'), membership('p-c', 'PARTNER')],
      netProfitByProject: { 'p-a': 500000, 'p-b': -100000, 'p-c': 999999999 },
    });

    const result = await useCase.execute('u-1');

    expect(result.netProfitMinor).toBe(400000);
    expect(result.currency).toBe('BDT');
  });

  it('includes per-project name/biomass/openAlerts breakdown (no per-project finance breakdown in the wire contract)', async () => {
    const { useCase } = setup({
      memberships: [membership('p-a', 'OWNER')],
      biomassByProject: { 'p-a': 42 },
      alertsByProject: { 'p-a': 1 },
      netProfitByProject: { 'p-a': 12345 },
    });

    const result = await useCase.execute('u-1');

    expect(result.projects).toEqual([
      { projectId: 'p-a', name: 'Project p-a', biomassKg: 42, openAlerts: 1 },
    ]);
  });
});
