import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { WeatherSnapshot } from '../domain/weather-snapshot.entity';
import { WEATHER_STALENESS_THRESHOLD_MS } from '../domain/staleness.service';
import { GetWeatherUseCase } from './get-weather.usecase';
import { WeatherSnapshotRepositoryPort } from './ports/weather-snapshot-repository.port';

function snapshot(fetchedAt: Date): WeatherSnapshot {
  return WeatherSnapshot.reconstitute({
    projectId: 'p-1',
    tempC: 33,
    condition: 'Clouds',
    heavyRain: false,
    extremeHeat: false,
    fetchedAt,
  });
}

function setup(overrides: { snapshot?: WeatherSnapshot | null } = {}) {
  const snapshots: jest.Mocked<WeatherSnapshotRepositoryPort> = {
    findForCurrentProject: jest
      .fn()
      .mockResolvedValue(overrides.snapshot === undefined ? snapshot(new Date()) : overrides.snapshot),
  };
  const useCase = new GetWeatherUseCase(snapshots);
  return { useCase, snapshots };
}

describe('GetWeatherUseCase (TASK-036, CON-037, AC-120/121)', () => {
  it('AC-120: returns the cached snapshot fresh (stale=false) when recently fetched', async () => {
    const { useCase } = setup({ snapshot: snapshot(new Date()) });
    const result = await useCase.execute();
    expect(result.stale).toBe(false);
    expect(result.snapshot.tempC).toBe(33);
  });

  it('AC-121: stale=true is computed live once the cache has aged past the threshold', async () => {
    const old = new Date(Date.now() - (WEATHER_STALENESS_THRESHOLD_MS + 60_000));
    const { useCase } = setup({ snapshot: snapshot(old) });
    const result = await useCase.execute();
    expect(result.stale).toBe(true);
  });

  it('AC-121: no cache at all is a legitimate 404, not a crash', async () => {
    const { useCase } = setup({ snapshot: null });
    await expect(useCase.execute()).rejects.toBeInstanceOf(NotFoundError);
  });
});
