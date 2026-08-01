import { ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { WaterReading } from '../domain/water-reading.entity';
import { IngestSensorUseCase } from './ingest-sensor.usecase';
import { WaterReadingRepositoryPort } from './ports/water-reading-repository.port';

describe('IngestSensorUseCase (CON-044, AC-089)', () => {
  let readings: jest.Mocked<WaterReadingRepositoryPort>;
  let tenant: { projectId: string };
  let useCase: IngestSensorUseCase;

  beforeEach(() => {
    readings = {
      findForPond: jest.fn(),
      findForPondBetween: jest.fn(),
      findForProjectBetween: jest.fn(),
      findByClientMutationId: jest.fn(),
      save: jest.fn().mockImplementation((r: WaterReading) => Promise.resolve(r)),
    };
    tenant = { projectId: 'project-A' };
    useCase = new IngestSensorUseCase(readings, tenant as unknown as TenantContext);
  });

  it('stores a SENSOR reading in the device tenant project, with the device id set', async () => {
    const readAt = new Date('2026-07-01T05:00:00.000Z');
    const saved = await useCase.execute({
      pondId: 'pond-1',
      deviceId: 'device-1',
      parameter: 'DO',
      value: 6.2,
      readAt,
    });

    expect(readings.save).toHaveBeenCalledTimes(1);
    expect(saved.source).toBe('SENSOR');
    expect(saved.projectId).toBe('project-A');
    expect(saved.pondId).toBe('pond-1');
    expect(saved.deviceId).toBe('device-1');
    expect(saved.parameter).toBe('DO');
    expect(saved.value).toBe(6.2);
    expect(saved.readAt).toEqual(readAt);
    // A server-generated idempotency key (sensor payload has none).
    expect(saved.clientMutationId).toEqual(expect.any(String));
  });

  it('rejects a non-finite value', async () => {
    await expect(
      useCase.execute({
        pondId: 'pond-1',
        deviceId: 'device-1',
        parameter: 'DO',
        value: Number.NaN,
        readAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(readings.save).not.toHaveBeenCalled();
  });
});
