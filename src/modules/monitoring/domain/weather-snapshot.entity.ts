import type { WeatherForecastDay } from './weather-forecast-day';

/**
 * Pure domain `WeatherSnapshot` (TASK-036, MOD-10 R3/R4, ERD `WEATHER_SNAPSHOT`). One cached
 * reading per project (upserted by `RefreshWeatherScheduler`), never fetched live on the read
 * path — `GetWeatherUseCase` only ever reads this cache (R3: "never blocks the dashboard").
 * Metrics (humidity/wind/rain/feels-like) come from OpenWeather current and are nullable for
 * older cache rows until the next successful refresh.
 */
export interface WeatherSnapshotProps {
  readonly projectId: string;
  readonly tempC: number;
  readonly condition: string;
  readonly heavyRain: boolean;
  readonly extremeHeat: boolean;
  readonly fetchedAt: Date;
  readonly forecast: readonly WeatherForecastDay[] | null;
  readonly humidityPct: number | null;
  readonly windKmh: number | null;
  readonly windDir: string | null;
  readonly rainMm: number | null;
  readonly feelsLikeC: number | null;
}

export class WeatherSnapshot {
  private constructor(private readonly props: WeatherSnapshotProps) {}

  static reconstitute(props: WeatherSnapshotProps): WeatherSnapshot {
    return new WeatherSnapshot(props);
  }

  get projectId(): string {
    return this.props.projectId;
  }

  get tempC(): number {
    return this.props.tempC;
  }

  get condition(): string {
    return this.props.condition;
  }

  get heavyRain(): boolean {
    return this.props.heavyRain;
  }

  get extremeHeat(): boolean {
    return this.props.extremeHeat;
  }

  get fetchedAt(): Date {
    return this.props.fetchedAt;
  }

  get forecast(): readonly WeatherForecastDay[] | null {
    return this.props.forecast;
  }

  get humidityPct(): number | null {
    return this.props.humidityPct;
  }

  get windKmh(): number | null {
    return this.props.windKmh;
  }

  get windDir(): string | null {
    return this.props.windDir;
  }

  get rainMm(): number | null {
    return this.props.rainMm;
  }

  get feelsLikeC(): number | null {
    return this.props.feelsLikeC;
  }
}
