import { WaterParameter, WaterReading } from '../domain/water-reading.entity';
import { GetWaterTrendsUseCase } from './get-water-trends.usecase';
import { WaterReadingRepositoryPort } from './ports/water-reading-repository.port';

function dawn(dayOfMonth: number): Date {
  // 06:00 Dhaka local = 00:00 UTC (Bangladesh is UTC+6).
  return new Date(Date.UTC(2026, 5, dayOfMonth, 0, 0, 0));
}

function makeReading(parameter: WaterParameter, value: number, readAt: Date): WaterReading {
  return WaterReading.reconstitute({
    id: `r-${readAt.toISOString()}`,
    projectId: 'proj-1',
    pondId: 'pond-1',
    parameter,
    value,
    source: 'MANUAL',
    deviceId: null,
    readAt,
    clientMutationId: `cm-${readAt.toISOString()}`,
    createdAt: readAt,
  });
}

describe('GetWaterTrendsUseCase (CON-059, AC-087)', () => {
  let readings: jest.Mocked<WaterReadingRepositoryPort>;
  let useCase: GetWaterTrendsUseCase;

  beforeEach(() => {
    readings = {
      findForPond: jest.fn(),
      findForPondBetween: jest.fn(),
      findForProjectBetween: jest.fn(),
      findByClientMutationId: jest.fn(),
      save: jest.fn(),
    };
    useCase = new GetWaterTrendsUseCase(readings);
  });

  it('returns the series ascending by readAt regardless of repo order', async () => {
    readings.findForPondBetween.mockResolvedValue([
      makeReading('TEMP', 30, dawn(3)),
      makeReading('TEMP', 28, dawn(1)),
      makeReading('TEMP', 29, dawn(2)),
    ]);

    const result = await useCase.execute('pond-1', 'TEMP', dawn(1), dawn(4));

    expect(result.series.map((r) => r.readAt)).toEqual([dawn(1), dawn(2), dawn(3)]);
    expect(readings.findForPondBetween).toHaveBeenCalledWith('pond-1', 'TEMP', dawn(1), dawn(4));
  });

  it('surfaces the falling-dawn-DO advisory for a declining DO series', async () => {
    readings.findForPondBetween.mockResolvedValue([
      makeReading('DO', 6.0, dawn(1)),
      makeReading('DO', 5.0, dawn(2)),
      makeReading('DO', 4.0, dawn(3)),
    ]);

    const result = await useCase.execute('pond-1', 'DO', dawn(1), dawn(4));

    expect(result.advisory).toMatchObject({ pattern: 'FALLING_DAWN_DO', consecutiveDays: 3 });
  });

  it('never computes the DO advisory for a non-DO parameter, even when values decline', async () => {
    readings.findForPondBetween.mockResolvedValue([
      makeReading('PH', 8.0, dawn(1)),
      makeReading('PH', 7.5, dawn(2)),
      makeReading('PH', 7.0, dawn(3)),
    ]);

    const result = await useCase.execute('pond-1', 'PH', dawn(1), dawn(4));

    expect(result.advisory).toBeNull();
    expect(result.series).toHaveLength(3);
  });

  it('returns a null advisory for a DO series with no active pattern', async () => {
    readings.findForPondBetween.mockResolvedValue([
      makeReading('DO', 5, dawn(1)),
      makeReading('DO', 6, dawn(2)),
    ]);

    const result = await useCase.execute('pond-1', 'DO', dawn(1), dawn(3));

    expect(result.advisory).toBeNull();
  });
});
