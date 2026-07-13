import {
  __resetAdvisoryRegistry,
  getAdvisoriesForRitu,
  getRitu,
  registerSeasonalAdvisory,
  rituName,
} from './ritu';

describe('getRitu (TASK-007, AC-046, R5)', () => {
  it.each([
    [1, 'GRISHMO'], // Boishakh
    [2, 'GRISHMO'], // Joishtho
    [3, 'BORSHA'], // Asharh
    [4, 'BORSHA'], // Srabon
    [5, 'SHAROD'], // Bhadro
    [6, 'SHAROD'], // Ashshin
    [7, 'HEMONTO'], // Kartik
    [8, 'HEMONTO'], // Ogrohayon
    [9, 'SHEET'], // Poush
    [10, 'SHEET'], // Magh
    [11, 'BOSONTO'], // Falgun
    [12, 'BOSONTO'], // Choitro
  ] as const)('month %i → %s', (month, expected) => {
    expect(getRitu(month)).toBe(expected);
  });

  it('accepts a BanglaDate-shaped object', () => {
    expect(getRitu({ month: 3 })).toBe('BORSHA');
  });

  it('rejects an out-of-range month', () => {
    expect(() => getRitu(13)).toThrow(RangeError);
    expect(() => getRitu(0)).toThrow(RangeError);
  });
});

describe('rituName', () => {
  it('title-cases the enum value', () => {
    expect(rituName('BORSHA')).toBe('Borsha');
    expect(rituName('GRISHMO')).toBe('Grishmo');
  });
});

describe('seasonal advisory registry (F4)', () => {
  afterEach(() => {
    __resetAdvisoryRegistry();
  });

  it('returns advisories registered for a ritu', () => {
    registerSeasonalAdvisory('BORSHA', { source: 'MOD-06', message: 'Monitor DO closely.' });
    expect(getAdvisoriesForRitu('BORSHA')).toEqual([
      { source: 'MOD-06', message: 'Monitor DO closely.' },
    ]);
  });

  it('returns an empty array for a ritu with no advisories', () => {
    expect(getAdvisoriesForRitu('SHEET')).toEqual([]);
  });

  it('accumulates advisories from multiple registrations', () => {
    registerSeasonalAdvisory('GRISHMO', { source: 'MOD-05', message: 'Increase feeding.' });
    registerSeasonalAdvisory('GRISHMO', { source: 'MOD-06', message: 'Watch for heat stress.' });
    expect(getAdvisoriesForRitu('GRISHMO')).toHaveLength(2);
  });

  it('throws for an unknown ritu at registration (error table)', () => {
    // @ts-expect-error — deliberately invalid to prove the runtime guard
    expect(() => registerSeasonalAdvisory('MONSOON', { source: 'x', message: 'y' })).toThrow(
      'Unknown ritu: MONSOON.',
    );
  });
});
