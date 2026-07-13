import { Mortality } from './mortality.entity';

function mortality(overrides: Partial<Parameters<typeof Mortality.reconstitute>[0]> = {}) {
  return Mortality.reconstitute({
    id: 'm-1',
    projectId: 'p-1',
    batchId: 'b-1',
    count: 10,
    causeCategory: 'DISEASE',
    photoUrl: null,
    occurredAt: new Date('2026-01-01T00:00:00Z'),
    clientMutationId: 'cmid-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

describe('Mortality entity (TASK-028)', () => {
  it('exposes every persisted field', () => {
    const m = mortality({ photoUrl: 'https://example.com/photo.jpg' });
    expect(m.id).toBe('m-1');
    expect(m.projectId).toBe('p-1');
    expect(m.batchId).toBe('b-1');
    expect(m.count).toBe(10);
    expect(m.causeCategory).toBe('DISEASE');
    expect(m.photoUrl).toBe('https://example.com/photo.jpg');
    expect(m.clientMutationId).toBe('cmid-1');
  });

  it('accepts any non-empty causeCategory string, not just the suggested seed list', () => {
    const m = mortality({ causeCategory: 'algal-bloom' });
    expect(m.causeCategory).toBe('algal-bloom');
  });
});
