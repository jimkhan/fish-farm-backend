import { HarvestGrade } from '../../harvest/domain/harvest.entity';

/**
 * R5 seed defaults (module doc: "if no market rate is set, use the configured default and flag
 * it"; §4.7 confirms a market-rate config endpoint is explicitly deferred — `CON-054`, "not
 * required for MVP compute," same deferral pattern as TASK-021's BW% bands). No BRD/GLOSSARY
 * source names actual BDT/kg figures, so these are documented, tunable defaults — flagged for
 * human confirmation, same category as `DEFAULT_WATER_THRESHOLDS`' alkalinity resolution
 * (TASK-023).
 */
export const MARKET_RATE_MINOR_PER_KG: Record<HarvestGrade, number> = {
  EXPORT: 80_000, // 800 BDT/kg
  LOCAL: 25_000, // 250 BDT/kg
};
