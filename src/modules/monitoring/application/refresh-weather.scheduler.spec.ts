import { ProjectRepositoryPort } from '../../projects/application/ports/project-repository.port';
import { Project } from '../../projects/domain/project.entity';
import { RefreshWeatherScheduler } from './refresh-weather.scheduler';
import { WeatherAdapterPort } from './ports/weather-adapter.port';
import { WeatherSnapshotEventRepositoryPort } from './ports/weather-snapshot-event-repository.port';

function makeProject(overrides: Partial<Parameters<typeof Project.reconstitute>[0]> = {}): Project {
  return Project.reconstitute({
    id: 'p-1',
    name: 'Farm',
    siteLat: 23.8,
    siteLng: 90.4,
    address: null,
    currency: 'BDT',
    landUnit: 'BIGHA',
    status: 'ACTIVE',
    createdAt: new Date(),
    ...overrides,
  });
}

function setup(overrides: { projects?: Project[] } = {}) {
  const projects: jest.Mocked<ProjectRepositoryPort> = {
    findAllActive: jest.fn().mockResolvedValue(overrides.projects ?? [makeProject()]),
    findById: jest.fn(),
    findByIds: jest.fn().mockResolvedValue([]),
    findPage: jest.fn(),
    save: jest.fn(),
  };
  const weather: jest.Mocked<WeatherAdapterPort> = {
    fetch: jest.fn().mockResolvedValue({
      tempC: 34,
      condition: 'Clear',
      heavyRain: false,
      extremeHeat: false,
      humidityPct: 70,
      windKmh: 12,
      windDir: 'SW',
      rainMm: 0,
      feelsLikeC: 36,
    }),
    fetchForecast: jest.fn().mockResolvedValue([]),
  };
  const snapshots: jest.Mocked<WeatherSnapshotEventRepositoryPort> = {
    upsert: jest.fn().mockResolvedValue(undefined),
  };
  const scheduler = new RefreshWeatherScheduler(projects, weather, snapshots);
  return { scheduler, projects, weather, snapshots };
}

describe('RefreshWeatherScheduler (TASK-036, F1/R3)', () => {
  it('fetches weather for every ACTIVE project by its own site lat/long and upserts the cache', async () => {
    const { scheduler, weather, snapshots } = setup();
    await scheduler.refresh();

    expect(weather.fetch).toHaveBeenCalledWith(23.8, 90.4);
    expect(snapshots.upsert).toHaveBeenCalledTimes(1);
    const upserted = snapshots.upsert.mock.calls[0][0];
    expect(upserted.projectId).toBe('p-1');
    expect(upserted.tempC).toBe(34);
  });

  it('a failed fetch for one project is skipped, never upserted, and never blocks the others', async () => {
    const { scheduler, weather, snapshots, projects } = setup({
      projects: [makeProject({ id: 'p-1' }), makeProject({ id: 'p-2' })],
    });
    weather.fetch.mockResolvedValueOnce(null).mockResolvedValueOnce({
      tempC: 30,
      condition: 'Clear',
      heavyRain: false,
      extremeHeat: false,
      humidityPct: 60,
      windKmh: 8,
      windDir: 'N',
      rainMm: 0,
      feelsLikeC: 31,
    });

    await scheduler.refresh();

    expect(projects.findAllActive).toHaveBeenCalledTimes(1);
    expect(snapshots.upsert).toHaveBeenCalledTimes(1);
    expect(snapshots.upsert.mock.calls[0][0].projectId).toBe('p-2');
  });

  it('no active projects — no fetch attempted', async () => {
    const { scheduler, weather, snapshots } = setup({ projects: [] });
    await scheduler.refresh();
    expect(weather.fetch).not.toHaveBeenCalled();
    expect(snapshots.upsert).not.toHaveBeenCalled();
  });
});
