/**
 * Stocking-density advisory (FT-021, MOD-04 F4/R5, AC-065).
 *
 * Lives here, not in a surface, because the advisory is rendered by the owner web app and the
 * worker mobile app while the *rule* — including the land-unit conversion below — is one domain
 * decision that must not differ between them (NFR-016, the same reasoning as `@fish-farm/calendar`).
 * An earlier duplicate in the web app skipped the conversion entirely and mislabelled the range,
 * which is exactly the divergence a shared implementation prevents.
 */

/** A project's land unit (`Project.landUnit`, ADR-018 — BIGHA is the default). */
export type LandUnit = 'DECIMAL' | 'KATHA' | 'BIGHA';

/**
 * `Species.defaultDensityMin/Max` are stored **per bigha** (ERD.md `SPECIES`), but a pond's `area`
 * is in its project's land unit — so the range has to be converted before it means anything.
 *
 * The only conversion figure anywhere in the specs is explicitly approximate ("1 bigha ≈ 33
 * decimal, region-dependent" — GLOSSARY/ADR-018), and no katha figure exists at all. Rather than
 * invent one, a KATHA project is reported as `NO_RANGE`: recorded but not assessed. Guessing a
 * factor here would produce a confident number that is silently wrong.
 */
const BIGHA_PER_UNIT: Partial<Record<LandUnit, number>> = {
  BIGHA: 1,
  DECIMAL: 1 / 33,
};

export type DensityVerdict = 'IN_RANGE' | 'OVER' | 'UNDER' | 'NO_RANGE';

export interface DensityAssessment {
  /** Stocked count per unit of pond area, in the project's land unit. */
  readonly perUnit: number;
  readonly verdict: DensityVerdict;
  /**
   * The species' safe range **converted into the project's land unit**, so a caller can render
   * `Safe {min}–{max} /{unit}` truthfully. `null` when the species has no seeded range, or when
   * the unit has no known conversion.
   */
  readonly min: number | null;
  readonly max: number | null;
  /** How far above `max` the pond is stocked, same unit as `perUnit`. Only set when `OVER`. */
  readonly overBy: number | null;
}

/**
 * Assesses one batch's stocking density. Returns `null` when it cannot be computed at all — no
 * recorded area, or a non-positive one (edge case 8: never divide by zero) — so the caller renders
 * "not assessed" rather than `Infinity`.
 */
export function assessDensity(
  count: number | null | undefined,
  area: number | null | undefined,
  landUnit: LandUnit,
  minPerBigha: number | null | undefined,
  maxPerBigha: number | null | undefined,
): DensityAssessment | null {
  if (typeof count !== 'number' || typeof area !== 'number' || area <= 0) {
    return null;
  }

  const perUnit = count / area;
  const bighaPerUnit = BIGHA_PER_UNIT[landUnit];
  const noRange = { perUnit, verdict: 'NO_RANGE' as const, min: null, max: null, overBy: null };

  if (bighaPerUnit === undefined) {
    return noRange; // KATHA — no documented conversion, so not assessed rather than guessed.
  }
  if (
    (minPerBigha === null || minPerBigha === undefined) &&
    (maxPerBigha === null || maxPerBigha === undefined)
  ) {
    return noRange;
  }

  // Convert the per-bigha range into the project's unit: 1 bigha ≈ 33 decimal, so a range of
  // 900/bigha is ~27/decimal. Comparing and displaying in the caller's own unit keeps the number
  // on screen consistent with the area beside it.
  const min = minPerBigha === null || minPerBigha === undefined ? null : minPerBigha * bighaPerUnit;
  const max = maxPerBigha === null || maxPerBigha === undefined ? null : maxPerBigha * bighaPerUnit;

  if (max !== null && perUnit > max) {
    return { perUnit, verdict: 'OVER', min, max, overBy: perUnit - max };
  }
  if (min !== null && perUnit < min) {
    return { perUnit, verdict: 'UNDER', min, max, overBy: null };
  }
  return { perUnit, verdict: 'IN_RANGE', min, max, overBy: null };
}
