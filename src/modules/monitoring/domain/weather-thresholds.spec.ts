import { isExtremeHeat, isHeavyRain, EXTREME_HEAT_THRESHOLD_C } from './weather-thresholds';

describe('weather-thresholds (TASK-036, R4, AC-120)', () => {
  it('isExtremeHeat: true at and above the threshold', () => {
    expect(isExtremeHeat(EXTREME_HEAT_THRESHOLD_C)).toBe(true);
    expect(isExtremeHeat(EXTREME_HEAT_THRESHOLD_C + 1)).toBe(true);
  });

  it('isExtremeHeat: false below the threshold', () => {
    expect(isExtremeHeat(EXTREME_HEAT_THRESHOLD_C - 0.1)).toBe(false);
  });

  it('isHeavyRain: true for OpenWeather heavy-rain condition codes', () => {
    expect(isHeavyRain(502)).toBe(true);
    expect(isHeavyRain(522)).toBe(true);
  });

  it('isHeavyRain: false for light rain / clear conditions', () => {
    expect(isHeavyRain(500)).toBe(false); // light rain
    expect(isHeavyRain(800)).toBe(false); // clear sky
  });
});
