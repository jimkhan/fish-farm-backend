import { DomainEventBus } from '../../../platform/events/domain-event-bus';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { PondRepositoryPort } from '../../ponds/application/ports/pond-repository.port';
import { Pond } from '../../ponds/domain/pond.entity';
import { ProjectRepositoryPort } from '../../projects/application/ports/project-repository.port';
import { Project } from '../../projects/domain/project.entity';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { WaterReading } from '../domain/water-reading.entity';
import { WaterThreshold } from '../domain/water-threshold.entity';
import { RecordReadingUseCase } from './record-reading.usecase';
import { WaterReadingRepositoryPort } from './ports/water-reading-repository.port';
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

const pond = Pond.reconstitute({
  id: 'pond-1',
  projectId: 'p-1',
  name: 'North Pond',
  area: 10,
  depthM: null,
  notes: null,
  createdAt: new Date(),
});

function setup(
  overrides: { project?: Project | null; pond?: Pond | null; threshold?: WaterThreshold | null } = {},
) {
  const readings: jest.Mocked<WaterReadingRepositoryPort> = {
    findForProjectBetween: jest.fn().mockResolvedValue([]),
    findForPondBetween: jest.fn().mockResolvedValue([]),
    findForPond: jest.fn(),
    findByClientMutationId: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockImplementation(async (r: WaterReading) => r),
  };
  const thresholds: jest.Mocked<WaterThresholdRepositoryPort> = {
    findAllInCurrentProject: jest.fn(),
    findByParameter: jest
      .fn()
      .mockResolvedValue(overrides.threshold === undefined ? null : overrides.threshold),
    save: jest.fn(),
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
  const events = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as DomainEventBus;
  const tenant = new TenantContext({ tenant: { userId: 'u-1', projectId: 'p-1', role: 'WORKER' } });

  const useCase = new RecordReadingUseCase(readings, thresholds, ponds, projects, events, tenant);
  return { useCase, readings, thresholds, ponds, projects, events };
}

describe('RecordReadingUseCase (TASK-023, CON-026, AC-083/084/085/090/092/093, R1/R3/R8/R9)', () => {
  it('AC-083: persists the reading scoped, always source=MANUAL, UTC readAt', async () => {
    const { useCase, readings } = setup();
    const reading = await useCase.execute('pond-1', {
      parameter: 'PH',
      value: 7.5,
      readAt: new Date('2026-02-01T10:00:00Z'),
      clientMutationId: 'cmid-1',
    });
    expect(reading.projectId).toBe('p-1');
    expect(reading.source).toBe('MANUAL');
    expect(readings.save).toHaveBeenCalledTimes(1);
  });

  it('AC-084/085: a reading outside the seeded default range emits WaterThresholdBreached WARNING', async () => {
    const { useCase, events } = setup();
    // No configured threshold — falls back to seeded default (DO min=4).
    await useCase.execute('pond-1', {
      parameter: 'DO',
      value: 3.5,
      readAt: new Date('2026-02-01T10:00:00Z'),
      clientMutationId: 'cmid-1',
    });
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'WaterThresholdBreached', severity: 'WARNING' }),
    );
  });

  it('AC-084: below the seeded critical bound emits CRITICAL', async () => {
    const { useCase, events } = setup();
    await useCase.execute('pond-1', {
      parameter: 'DO',
      value: 2.5, // below DO's seeded critical=3
      readAt: new Date('2026-02-01T10:00:00Z'),
      clientMutationId: 'cmid-1',
    });
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'WaterThresholdBreached', severity: 'CRITICAL' }),
    );
  });

  it('AC-085: a configured project override takes precedence over the seeded default', async () => {
    const strictDo = WaterThreshold.reconstitute({
      id: 't-1',
      projectId: 'p-1',
      parameter: 'DO',
      min: 6,
      max: null,
      critical: 5,
    });
    const { useCase, events } = setup({ threshold: strictDo });
    // 5.5 is within the seeded default (min=4) but breaches the configured override (min=6).
    await useCase.execute('pond-1', {
      parameter: 'DO',
      value: 5.5,
      readAt: new Date('2026-02-01T10:00:00Z'),
      clientMutationId: 'cmid-1',
    });
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'WaterThresholdBreached', severity: 'WARNING' }),
    );
  });

  it('AC-092: a max-only parameter never breaches on a low value', async () => {
    const { useCase, events } = setup();
    await useCase.execute('pond-1', {
      parameter: 'AMMONIA',
      value: 0,
      readAt: new Date('2026-02-01T10:00:00Z'),
      clientMutationId: 'cmid-1',
    });
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('a reading within range emits nothing', async () => {
    const { useCase, events } = setup();
    await useCase.execute('pond-1', {
      parameter: 'PH',
      value: 7.5,
      readAt: new Date('2026-02-01T10:00:00Z'),
      clientMutationId: 'cmid-1',
    });
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('ADR-010: a replayed clientMutationId is idempotent', async () => {
    const existing = WaterReading.reconstitute({
      id: 'r-existing',
      projectId: 'p-1',
      pondId: 'pond-1',
      parameter: 'PH',
      value: 7.5,
      source: 'MANUAL',
      deviceId: null,
      readAt: new Date('2026-02-01T10:00:00Z'),
      clientMutationId: 'cmid-1',
      createdAt: new Date(),
    });
    const { useCase, readings, events } = setup();
    readings.findByClientMutationId.mockResolvedValue(existing);

    const result = await useCase.execute('pond-1', {
      parameter: 'PH',
      value: 7.5,
      readAt: new Date('2026-02-01T10:00:00Z'),
      clientMutationId: 'cmid-1',
    });
    expect(result).toBe(existing);
    expect(readings.save).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('AC-090: a pond from another project (or unknown) is not found', async () => {
    const { useCase, readings } = setup({ pond: null });
    await expect(
      useCase.execute('pond-elsewhere', {
        parameter: 'PH',
        value: 7.5,
        readAt: new Date('2026-02-01T10:00:00Z'),
        clientMutationId: 'cmid-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(readings.save).not.toHaveBeenCalled();
  });

  it('a non-finite value is rejected', async () => {
    const { useCase, readings } = setup();
    await expect(
      useCase.execute('pond-1', {
        parameter: 'PH',
        value: NaN,
        readAt: new Date('2026-02-01T10:00:00Z'),
        clientMutationId: 'cmid-1',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(readings.save).not.toHaveBeenCalled();
  });

  it('AC-093: a CLOSED project rejects with PROJECT_CLOSED', async () => {
    const closedProject = Project.reconstitute({ ...activeProjectProps, status: 'CLOSED' });
    const { useCase } = setup({ project: closedProject });
    await expect(
      useCase.execute('pond-1', {
        parameter: 'PH',
        value: 7.5,
        readAt: new Date('2026-02-01T10:00:00Z'),
        clientMutationId: 'cmid-1',
      }),
    ).rejects.toBeInstanceOf(ProjectClosedError);
  });
});
