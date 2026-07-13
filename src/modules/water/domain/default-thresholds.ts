import { WaterParameter } from './water-reading.entity';
import { ThresholdBounds } from './breach-evaluator';

/**
 * R2 seed defaults (BRD-advisory, module doc's own open question resolved to "seed BRD-suggested
 * ranges"). Used as the fallback when a project has no explicit `WaterThreshold` row for a
 * parameter (AC-085 — "configured, **or seeded defaults are used**") rather than writing rows at
 * project-creation time (which would require reopening TASK-011's already-reviewed
 * `CreateProjectUseCase`, unnecessary for a pure read-time fallback).
 *
 * **Documented spec inconsistency, resolved**: R2's prose lists "alkalinity 50–150 mg/L" (reads
 * like a range) but R2's own classification sentence explicitly places alkalinity in the
 * **min-only** group ("min-only (DO, alkalinity)"). The classification sentence is more precise/
 * deliberate than the prose example, so alkalinity seeds `min: 50, max: null` here — the "150" is
 * treated as descriptive context, not a hard threshold. Flagged for human confirmation.
 */
export const DEFAULT_WATER_THRESHOLDS: Record<WaterParameter, ThresholdBounds> = {
  DO: { min: 4, max: null, critical: 3 },
  PH: { min: 7.0, max: 8.5, critical: null },
  TEMP: { min: 26, max: 32, critical: null },
  AMMONIA: { min: null, max: 0.1, critical: null },
  NITRITE: { min: null, max: 0.5, critical: null },
  ALKALINITY: { min: 50, max: null, critical: null },
  SECCHI: { min: 30, max: 40, critical: null },
};
