import { And, FindOperator, LessThan, MoreThanOrEqual } from 'typeorm';

/**
 * A half-open `[fromInclusive, toExclusive)` range operator.
 *
 * Deliberately **not** TypeORM's `Between`, which emits SQL `BETWEEN a AND b` — inclusive on
 * *both* ends. Every date-window query in this codebase is computed as half-open (see
 * `utcDayRange`, which derives `toExclusive` as `fromInclusive + 24h`), so `Between` would
 * return a row stamped exactly on the upper boundary in two adjacent windows: a reading posted
 * with a date-only value (`new Date('2026-08-17')` → midnight UTC) would be counted in both the
 * 16th's and the 17th's daily summary, and in two consecutive abnormal-mortality windows.
 *
 * Use this for every `findForXBetween(fromInclusive, toExclusive)` repository method.
 */
export function halfOpenRange(fromInclusive: Date, toExclusive: Date): FindOperator<Date> {
  return And(MoreThanOrEqual(fromInclusive), LessThan(toExclusive));
}
