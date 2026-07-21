export type FinancialKind = 'COST' | 'REVENUE';
export type FinancialCategory =
  | 'FEED'
  | 'SALARY'
  | 'MEDICINE'
  | 'STOCKING'
  | 'EQUIPMENT'
  | 'MISC'
  | 'HARVEST';

/** R2: cost categories are FEED/SALARY/MEDICINE/STOCKING/EQUIPMENT/MISC; revenue is HARVEST only. */
export function isValidKindCategory(kind: FinancialKind, category: FinancialCategory): boolean {
  return category === 'HARVEST' ? kind === 'REVENUE' : kind === 'COST';
}
