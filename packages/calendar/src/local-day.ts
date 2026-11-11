/**
 * Bangladesh local calendar day (MOD-11, FR-058).
 *
 * Bangladesh observes UTC+6 year-round with no DST, so a fixed offset is exact — no tz database,
 * and no `Intl` (forbidden for calendar work by CLAUDE.md invariant #6). This mirrors the offset
 * `PatternDetector` already uses to classify a "dawn" reading; it lives here because every
 * surface — backend, web, mobile — must agree on which calendar day an instant belongs to
 * (NFR-016), exactly like the conversion rules themselves.
 */
export const BANGLADESH_UTC_OFFSET_MINUTES = 6 * 60;

const OFFSET_MS = BANGLADESH_UTC_OFFSET_MINUTES * 60 * 1000;

/**
 * The Bangladesh-local calendar day containing `instant`, returned as a Date pinned to UTC
 * midnight — the shape {@link toBangla} and every `date`-typed column already expect.
 *
 * Storage stays UTC (CLAUDE.md §5); this is a *display*-side concern. Reading UTC components off
 * a raw instant answers "what day is it in London", which for a Dhaka farm at 02:00 is still
 * yesterday — so the owner's dashboard would show yesterday's date, in both the Gregorian and
 * Bangla halves, from midnight until 06:00 every single day.
 *
 * Passing a date-only value (`new Date('2026-08-17')`, i.e. UTC midnight — how a `date` column
 * deserialises) is safe and idempotent: shifting midnight forward by six hours stays on the same
 * calendar day.
 */
export function toBangladeshLocalDay(instant: Date): Date {
  const shifted = new Date(instant.getTime() + OFFSET_MS);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
  );
}

/** `YYYY-MM-DD` for the Bangladesh-local calendar day containing `instant`. */
export function bangladeshLocalDayIso(instant: Date): string {
  return toBangladeshLocalDay(instant).toISOString().slice(0, 10);
}
