import { isValidKindCategory } from './category.vo';

describe('isValidKindCategory (TASK-032, R2)', () => {
  it('HARVEST is valid only as REVENUE', () => {
    expect(isValidKindCategory('REVENUE', 'HARVEST')).toBe(true);
    expect(isValidKindCategory('COST', 'HARVEST')).toBe(false);
  });

  it.each(['FEED', 'SALARY', 'MEDICINE', 'STOCKING', 'EQUIPMENT', 'MISC'] as const)(
    '%s is valid only as COST',
    (category) => {
      expect(isValidKindCategory('COST', category)).toBe(true);
      expect(isValidKindCategory('REVENUE', category)).toBe(false);
    },
  );
});
