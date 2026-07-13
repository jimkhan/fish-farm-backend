import { getRitu } from './ritu';
import { BanglaDate, BanglaDateInput, InvalidBanglaDateError, InvalidInputError } from './types';

/**
 * Gregorian↔Bangla conversion (Bangladesh-revised 2019 rules, MOD-11 §2.4/§4.4). All dates are
 * handled as UTC midnight to avoid timezone-dependent day boundaries — a pure package must be
 * deterministic regardless of the host's local timezone (R8).
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Months 1–10 are fixed length; Falgun (11) varies; Choitro (12) is fixed (R2). */
const FIXED_MONTH_LENGTHS = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30] as const;
const CHOITRO_LENGTH = 30;

function isGregorianLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Falgun's length for the Bangla year whose Boishakh 1 falls in Gregorian year `boishakh1Year`.
 * Falgun's February falls in the *following* Gregorian year (R3) — e.g. the year that begins
 * 14 Apr 2023 has its Falgun in Feb 2024, so 2024's leap status governs.
 */
function falgunLength(boishakh1Year: number): number {
  return isGregorianLeapYear(boishakh1Year + 1) ? 30 : 29;
}

function monthLengthsFor(boishakh1Year: number): readonly number[] {
  return [...FIXED_MONTH_LENGTHS, falgunLength(boishakh1Year), CHOITRO_LENGTH];
}

/** UTC midnight for the given y/m/d (`m` is 0-indexed, matching `Date.UTC`). */
function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

/** The Gregorian year whose 14 April is on or before `date` — the governing Boishakh-1 year. */
function boishakh1YearFor(date: Date): number {
  const year = date.getUTCFullYear();
  const boishakh1ThisYear = utcDate(year, 3, 14); // April is month index 3
  return date.getTime() >= boishakh1ThisYear.getTime() ? year : year - 1;
}

/** Gregorian → Bangla (F1, AC-041…044). */
export function toBangla(date: Date): BanglaDate {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new InvalidInputError();
  }
  // Normalize to UTC midnight so a caller's local-time Date still lands on the correct day.
  const normalized = utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

  const boishakh1Year = boishakh1YearFor(normalized);
  const boishakh1 = utcDate(boishakh1Year, 3, 14);
  const dayOffset = Math.round((normalized.getTime() - boishakh1.getTime()) / MS_PER_DAY);

  const monthLengths = monthLengthsFor(boishakh1Year);
  let remaining = dayOffset;
  let monthIndex = 0;
  while (remaining >= monthLengths[monthIndex]) {
    remaining -= monthLengths[monthIndex];
    monthIndex++;
  }

  const month = monthIndex + 1;
  const day = remaining + 1;
  return { year: boishakh1Year - 593, month, day, ritu: getRitu(month) };
}

/** Bangla → Gregorian (F2, AC-044 round-trip). Throws `InvalidBanglaDateError` per R5/AC-048. */
export function toGregorian(input: BanglaDateInput): Date {
  const { year, month, day } = input;
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new InvalidBanglaDateError(`month must be 1-12, got ${month}`);
  }

  const boishakh1Year = year + 593;
  const monthLengths = monthLengthsFor(boishakh1Year);
  const lengthOfMonth = monthLengths[month - 1];
  if (!Number.isInteger(day) || day < 1 || day > lengthOfMonth) {
    throw new InvalidBanglaDateError(
      `day must be 1-${lengthOfMonth} for month ${month} of Bangla year ${year}, got ${day}`,
    );
  }

  const daysBeforeMonth = monthLengths.slice(0, month - 1).reduce((sum, n) => sum + n, 0);
  const offset = daysBeforeMonth + (day - 1);

  const boishakh1 = utcDate(boishakh1Year, 3, 14);
  return new Date(boishakh1.getTime() + offset * MS_PER_DAY);
}
