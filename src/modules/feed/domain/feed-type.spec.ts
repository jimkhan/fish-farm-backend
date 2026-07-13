import { feedTypeForSpeciesCategory } from './feed-type';

describe('feedTypeForSpeciesCategory (TASK-021, F3, GLOSSARY §2 "Feed type")', () => {
  it('PRAWN (Golda) maps to SINKING', () => {
    expect(feedTypeForSpeciesCategory('PRAWN')).toBe('SINKING');
  });

  it('FISH (Carp/Parse/Grass Carp) maps to FLOATING', () => {
    expect(feedTypeForSpeciesCategory('FISH')).toBe('FLOATING');
  });
});
