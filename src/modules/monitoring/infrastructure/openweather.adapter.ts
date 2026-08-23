import { Injectable, Logger } from '@nestjs/common';
import { aggregateForecastDays } from '../domain/aggregate-forecast-days';
import type { WeatherForecastDay } from '../domain/weather-forecast-day';
import { isExtremeHeat, isHeavyRain } from '../domain/weather-thresholds';
import { windDirFromDeg, windMsToKmh } from '../domain/wind.util';
import {
  RawWeatherReading,
  WeatherAdapterPort,
} from '../application/ports/weather-adapter.port';

const OPENWEATHER_CURRENT_URL = 'https://api.openweathermap.org/data/2.5/weather';
const OPENWEATHER_FORECAST_URL = 'https://api.openweathermap.org/data/2.5/forecast';

interface OpenWeatherCurrentResponse {
  main?: { temp?: number; humidity?: number; feels_like?: number };
  weather?: Array<{ id?: number; main?: string }>;
  wind?: { speed?: number; deg?: number };
  rain?: { '1h'?: number; '3h'?: number };
}

interface OpenWeatherForecastResponse {
  list?: Array<{
    dt?: number;
    main?: { temp?: number; temp_min?: number; temp_max?: number };
    weather?: Array<{ id?: number; main?: string }>;
    pop?: number;
  }>;
}

/**
 * OpenWeather Current + 5-day/3-hour Forecast APIs (ADR-018). Never throws — missing key,
 * network failure, or non-OK response resolve to `null` / `[]` so schedulers degrade calmly.
 */
@Injectable()
export class OpenWeatherAdapter implements WeatherAdapterPort {
  private readonly logger = new Logger(OpenWeatherAdapter.name);

  constructor(private readonly apiKey: string | undefined) {}

  async fetch(lat: number, lng: number): Promise<RawWeatherReading | null> {
    if (!this.apiKey) {
      this.logger.warn('OPENWEATHER_API_KEY not configured — weather fetch skipped.');
      return null;
    }

    try {
      const url = `${OPENWEATHER_CURRENT_URL}?lat=${lat}&lon=${lng}&appid=${this.apiKey}&units=metric`;
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`OpenWeather current responded with status ${response.status}.`);
        return null;
      }

      const body = (await response.json()) as OpenWeatherCurrentResponse;
      const tempC = body.main?.temp;
      const condition = body.weather?.[0]?.main;
      const conditionId = body.weather?.[0]?.id;
      if (tempC === undefined || condition === undefined || conditionId === undefined) {
        this.logger.warn('OpenWeather current response missing expected fields.');
        return null;
      }

      const humidityRaw = body.main?.humidity;
      const feelsLikeRaw = body.main?.feels_like;
      const rainMm =
        body.rain?.['3h'] ?? body.rain?.['1h'] ?? (body.rain ? null : 0);

      return {
        tempC,
        condition,
        heavyRain: isHeavyRain(conditionId),
        extremeHeat: isExtremeHeat(tempC),
        humidityPct:
          humidityRaw !== undefined && Number.isFinite(humidityRaw) ? humidityRaw : null,
        windKmh: windMsToKmh(body.wind?.speed),
        windDir: windDirFromDeg(body.wind?.deg),
        rainMm: rainMm !== null && rainMm !== undefined && Number.isFinite(rainMm) ? rainMm : null,
        feelsLikeC:
          feelsLikeRaw !== undefined && Number.isFinite(feelsLikeRaw) ? feelsLikeRaw : null,
      };
    } catch (error) {
      this.logger.warn(
        `OpenWeather current fetch failed: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  async fetchForecast(lat: number, lng: number): Promise<WeatherForecastDay[] | null> {
    if (!this.apiKey) {
      return null;
    }

    try {
      const url = `${OPENWEATHER_FORECAST_URL}?lat=${lat}&lon=${lng}&appid=${this.apiKey}&units=metric`;
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`OpenWeather forecast responded with status ${response.status}.`);
        return null;
      }

      const body = (await response.json()) as OpenWeatherForecastResponse;
      const slots = (body.list ?? [])
        .map((item) => {
          const tempC = item.main?.temp;
          const condition = item.weather?.[0]?.main;
          const conditionId = item.weather?.[0]?.id;
          if (
            item.dt === undefined ||
            tempC === undefined ||
            condition === undefined ||
            conditionId === undefined
          ) {
            return null;
          }
          return {
            dt: item.dt,
            tempC,
            tempMinC: item.main?.temp_min ?? tempC,
            tempMaxC: item.main?.temp_max ?? tempC,
            condition,
            conditionId,
            pop: typeof item.pop === 'number' ? item.pop : 0,
          };
        })
        .filter((s): s is NonNullable<typeof s> => s != null);

      if (slots.length === 0) {
        this.logger.warn('OpenWeather forecast response had no usable slots.');
        return null;
      }

      return aggregateForecastDays(slots);
    } catch (error) {
      this.logger.warn(
        `OpenWeather forecast fetch failed: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }
}
