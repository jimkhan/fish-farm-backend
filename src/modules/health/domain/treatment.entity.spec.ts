import { Treatment } from './treatment.entity';

function treatment(overrides: Partial<Parameters<typeof Treatment.reconstitute>[0]> = {}) {
  return Treatment.reconstitute({
    id: 't-1',
    projectId: 'p-1',
    batchId: 'b-1',
    product: 'Oxytetracycline',
    dose: '50mg/kg',
    administeredOn: new Date('2026-01-01T00:00:00Z'),
    withdrawalDays: 14,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

describe('Treatment entity (TASK-028, R7)', () => {
  it('derives exportSafeAfter as administeredOn + withdrawalDays', () => {
    const t = treatment({ administeredOn: new Date('2026-01-01T00:00:00Z'), withdrawalDays: 14 });
    expect(t.exportSafeAfter.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('AC-101: coversDate is true inside the withdrawal window [administeredOn, exportSafeAfter)', () => {
    const t = treatment({ administeredOn: new Date('2026-01-01T00:00:00Z'), withdrawalDays: 14 });
    expect(t.coversDate(new Date('2026-01-01T00:00:00Z'))).toBe(true);
    expect(t.coversDate(new Date('2026-01-10T00:00:00Z'))).toBe(true);
    expect(t.coversDate(new Date('2026-01-14T23:59:59Z'))).toBe(true);
  });

  it('coversDate is false before administeredOn or on/after exportSafeAfter', () => {
    const t = treatment({ administeredOn: new Date('2026-01-01T00:00:00Z'), withdrawalDays: 14 });
    expect(t.coversDate(new Date('2025-12-31T00:00:00Z'))).toBe(false);
    expect(t.coversDate(new Date('2026-01-15T00:00:00Z'))).toBe(false);
    expect(t.coversDate(new Date('2026-02-01T00:00:00Z'))).toBe(false);
  });

  it('a zero-day withdrawal never covers any date (export-safe immediately)', () => {
    const t = treatment({ administeredOn: new Date('2026-01-01T00:00:00Z'), withdrawalDays: 0 });
    expect(t.coversDate(new Date('2026-01-01T00:00:00Z'))).toBe(false);
  });
});
