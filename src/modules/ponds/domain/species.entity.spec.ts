import { Species } from './species.entity';

describe('Species (TASK-018, MOD-04 R8)', () => {
  it('reconstitute() round-trips every field, including a null density range', () => {
    const species = Species.reconstitute({
      id: 's-1',
      name: 'SPF Golda',
      category: 'PRAWN',
      defaultDensityMin: null,
      defaultDensityMax: null,
    });

    expect(species.id).toBe('s-1');
    expect(species.name).toBe('SPF Golda');
    expect(species.category).toBe('PRAWN');
    expect(species.defaultDensityMin).toBeNull();
    expect(species.defaultDensityMax).toBeNull();
  });
});
