import { BreachEvaluator, ThresholdBounds } from '../../water/domain/breach-evaluator';
import { WaterParameter } from '../../water/domain/water-reading.entity';

export type DailyWaterStatus = 'OK' | 'WARNING' | 'CRITICAL';

const evaluator = new BreachEvaluator();

/**
 * R5/AC-122: the daily summary needs one `waterStatus` for the whole project/date, but readings
 * exist per-pond/per-parameter — reduced here to the **worst severity across every reading**
 * that day, across every pond (no spec text states this reduction rule explicitly; a documented
 * judgment call, same category as TASK-030's polyculture FCR-summing choice). A day with no
 * readings at all is `OK` — R5's own "no-activity day returns zeros" applied to an enum field:
 * no bad news recorded is the honest "nothing wrong" default, never fabricated as worse.
 */
export function reduceWaterStatus(
  readings: readonly { readonly parameter: WaterParameter; readonly value: number }[],
  thresholdsByParameter: Readonly<Record<WaterParameter, ThresholdBounds>>,
): DailyWaterStatus {
  let worst: DailyWaterStatus = 'OK';
  for (const reading of readings) {
    const severity = evaluator.evaluate(reading.value, thresholdsByParameter[reading.parameter]);
    if (severity === 'CRITICAL') {
      return 'CRITICAL'; // can't get worse — short-circuit
    }
    if (severity === 'WARNING') {
      worst = 'WARNING';
    }
  }
  return worst;
}
