/**
 * Pure domain `WeatherSnapshot` (TASK-036, MOD-10 R3/R4, ERD `WEATHER_SNAPSHOT`). One cached
 * reading per project (upserted by `RefreshWeatherScheduler`), never fetched live on the read
 * path — `GetWeatherUseCase` only ever reads this cache (R3: "never blocks the dashboard").
 * `heavyRain`/`extremeHeat` are pre-classified at fetch time (see `weather-thresholds.ts`), not
 * derived at read time — matches ERD's stored-column shape exactly.
 */
export interface WeatherSnapshotProps {
  readonly projectId: string;
  readonly tempC: number;
  readonly condition: string;
  readonly heavyRain: boolean;
  readonly extremeHeat: boolean;
  readonly fetchedAt: Date;
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
}
