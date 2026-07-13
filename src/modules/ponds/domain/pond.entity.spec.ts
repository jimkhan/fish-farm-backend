import { Pond } from './pond.entity';

describe('Pond (TASK-018, MOD-04 §4.3)', () => {
  it('reconstitute() round-trips every field', () => {
    const pond = Pond.reconstitute({
      id: 'pond-1',
      projectId: 'p-1',
      name: 'North Pond',
      area: 12.5,
      depthM: 1.8,
      notes: 'Near the gate',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(pond.id).toBe('pond-1');
    expect(pond.projectId).toBe('p-1');
    expect(pond.name).toBe('North Pond');
    expect(pond.area).toBe(12.5);
    expect(pond.depthM).toBe(1.8);
    expect(pond.notes).toBe('Near the gate');
  });

  it('allows null depthM/notes', () => {
    const pond = Pond.reconstitute({
      id: 'pond-1',
      projectId: 'p-1',
      name: 'North Pond',
      area: 12.5,
      depthM: null,
      notes: null,
      createdAt: new Date(),
    });
    expect(pond.depthM).toBeNull();
    expect(pond.notes).toBeNull();
  });
});
