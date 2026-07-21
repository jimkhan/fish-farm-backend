import { Injectable, Logger } from '@nestjs/common';
import { isExtremeHeat, isHeavyRain } from '../domain/weather-thresholds';
import { RawWeatherReading, WeatherAdapterPort } from '../application/ports/weather-adapter.port';

const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';

interface OpenWeatherResponse {
  main?: { temp?: number };
  weather?: Array<{ id?: number; main?: string }>;
}

/**
 * OpenWeather Current Weather API (ADR-018). Never throws — a missing key, network failure, or
 * non-OK response all resolve to `null` (same graceful-degradation shape as `FcmAdapter.send()`),
 * so `RefreshWeatherScheduler` never needs its own try/catch. Uses global `fetch` (Node 18+),
 * matching this codebase's one existing external-HTTP-call precedent — no new HTTP client
 * dependency added.
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
      const url = `${OPENWEATHER_BASE_URL}?lat=${lat}&lon=${lng}&appid=${this.apiKey}&units=metric`;
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`OpenWeather responded with status ${response.status}.`);
        return null;
      }

      const body = (await response.json()) as OpenWeatherResponse;
      const tempC = body.main?.temp;
      const condition = body.weather?.[0]?.main;
      const conditionId = body.weather?.[0]?.id;
      if (tempC === undefined || condition === undefined || conditionId === undefined) {
        this.logger.warn('OpenWeather response missing expected fields.');
        return null;
      }

      return {
        tempC,
        condition,
        heavyRain: isHeavyRain(conditionId),
        extremeHeat: isExtremeHeat(tempC),
      };
    } catch (error) {
      this.logger.warn(`OpenWeather fetch failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
