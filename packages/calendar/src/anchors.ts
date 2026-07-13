/**
 * Fixed national-day anchors (MOD-11 F6, AC-041) — the required correctness proof for the
 * Bangladesh-revised (2019) rules. Verified against a non-leap-Falgun year by `anchors.spec.ts`.
 */
export interface CalendarAnchor {
  readonly label: string;
  readonly gregorian: { readonly month: number; readonly day: number }; // month is 1-12
  readonly bangla: { readonly month: number; readonly day: number };
}

export const CALENDAR_ANCHORS: readonly CalendarAnchor[] = [
  { label: 'Ekushey (Language Martyrs’ Day)', gregorian: { month: 2, day: 21 }, bangla: { month: 11, day: 8 } }, // 8 Falgun
  { label: 'Independence Day', gregorian: { month: 3, day: 26 }, bangla: { month: 12, day: 12 } }, // 12 Choitro
  { label: 'Victory Day', gregorian: { month: 12, day: 16 }, bangla: { month: 9, day: 1 } }, // 1 Poush
  { label: 'Pohela Boishakh', gregorian: { month: 4, day: 14 }, bangla: { month: 1, day: 1 } }, // 1 Boishakh
];
