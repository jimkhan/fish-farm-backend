/**
 * TASK-037: the `date` query param is a plain calendar date (no timezone), matched against UTC
 * day boundaries — the same convention every other `date`-typed column in this codebase already
 * uses (stockedOn, harvestedOn, dueOn, ...), never a project-local timezone conversion (none is
 * modeled anywhere in the spec).
 */
export function utcDayRange(date: Date): { fromInclusive: Date; toExclusive: Date } {
  const fromInclusive = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const toExclusive = new Date(fromInclusive.getTime() + 24 * 60 * 60 * 1000);
  return { fromInclusive, toExclusive };
}
