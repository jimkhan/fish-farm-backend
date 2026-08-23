import {
  aggregateForecastDays,
  dhakaDateKey,
  FORECAST_RAIN_RISK_POP,
} from './aggregate-forecast-days';

describe('aggregateForecastDays', () => {
  it('groups 3-hour slots into Asia/Dhaka calendar days (max 5)', () => {
    // 2026-08-10 06:00 UTC = 12:00 Dhaka; 18:00 UTC = next Dhaka calendar day 00:00
    const days = aggregateForecastDays([
      {
        dt: 1754805600, // ~2026-08-10 06:00 UTC
        tempC: 30,
        tempMinC: 28,
        tempMaxC: 31,
        condition: 'Rain',
        conditionId: 500,
        pop: 0.7,
      },
      {
        dt: 1754816400, // +3h
        tempC: 32,
        tempMinC: 30,
        tempMaxC: 33,
        condition: 'Clouds',
        conditionId: 801,
        pop: 0.4,
      },
      {
        dt: 1754848800, // later → next Dhaka day
        tempC: 36,
        tempMinC: 34,
        tempMaxC: 37,
        condition: 'Clear',
        conditionId: 800,
        pop: 0.1,
      },
    ]);

    expect(days.length).toBeGreaterThanOrEqual(2);
    expect(days[0].date).toBe(dhakaDateKey(1754805600));
    expect(days[0].popPct).toBe(70);
    expect(days[0].rainRisk).toBe(true); // pop >= FORECAST_RAIN_RISK_POP
    expect(FORECAST_RAIN_RISK_POP).toBe(0.6);

    const heatDay = days.find((d) => d.heatRisk);
    expect(heatDay).toBeDefined();
    expect(heatDay!.tempMaxC).toBeGreaterThanOrEqual(35);
  });
});
