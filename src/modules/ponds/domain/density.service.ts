import { LandUnit } from '../../projects/domain/project.entity';

/**
 * Pure domain service (TASK-019, MOD-04 F4/R5, AC-065). Species sane-ranges are seeded
 * **per bigha** (ERD `SPECIES` note; ADR-018), but a pond's `area` is in its *project's*
 * `landUnit` — so comparing density against the seeded range needs a unit conversion first.
 *
 * The only conversion figure anywhere in the specs is an explicitly approximate one
 * ("1 bigha ≈ 33 decimal, region-dependent" — GLOSSARY/ADR-018); no katha figure exists at all.
 * Rather than invent one, KATHA-unit projects get `belowMin`/`aboveMax: null` (unknown) — the
 * same "unknown" result seeded species already return today, since every seeded species'
 * density range is still `null` pending real advisory numbers (a tracked follow-up, not this
 * task's job to fabricate).
 */
const BIGHA_PER_UNIT: Partial<Record<LandUnit, number>> = {
  BIGHA: 1,
  DECIMAL: 1 / 33,
};

export interface DensityAdvisory {
  readonly density: number;
  readonly belowMin: boolean | null;
  readonly aboveMax: boolean | null;
}

export function computeDensity(count: number, area: number): number {
  return count / area;
}

export function computeDensityAdvisory(
  count: number,
  area: number,
  landUnit: LandUnit,
  defaultDensityMinPerBigha: number | null,
  defaultDensityMaxPerBigha: number | null,
): DensityAdvisory {
  const density = computeDensity(count, area);
  const bighaPerUnit = BIGHA_PER_UNIT[landUnit];

  if (
    bighaPerUnit === undefined ||
    defaultDensityMinPerBigha === null ||
    defaultDensityMaxPerBigha === null
  ) {
    return { density, belowMin: null, aboveMax: null };
  }

  const densityPerBigha = density / bighaPerUnit;
  return {
    density,
    belowMin: densityPerBigha < defaultDensityMinPerBigha,
    aboveMax: densityPerBigha > defaultDensityMaxPerBigha,
  };
}
