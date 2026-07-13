# @fish-farm/calendar

The single Bangla-calendar implementation for all FMS surfaces (ADR-011, NFR-016): Gregorian↔
Bangla (Bangladesh-revised 2019) conversion, Bengali numerals, and ritu helpers. Never use
`Intl`/ICU for Bangla dates — it implements the West Bengal/sidereal calendar and gives wrong
dates (CLAUDE.md invariant #6).

TASK-051 established this skeleton and the publish/consume wiring; the implementation and the
mandatory anchor-test suite (21 Feb = 8 Falgun, 26 Mar = 12 Choitro, 16 Dec = 1 Poush,
14 Apr = 1 Boishakh) land with TASK-007.

- Hosted in `fish-farm-backend/packages/calendar`, published to web + mobile (ADR-002, OI-1) so
  the calendar stays byte-identical across surfaces.
- Build: `npm run build` (emits `dist/` with declarations). Pure TypeScript — no framework, no
  `Intl`.
