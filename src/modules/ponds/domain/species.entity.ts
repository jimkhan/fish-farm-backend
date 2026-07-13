/**
 * Pure domain `Species` (TASK-018, MOD-04 R8, ERD `SPECIES`). Reference data — not project-owned,
 * seeded via migration, read-only from the application layer (no create/update use-case).
 */
export type SpeciesCategory = 'PRAWN' | 'FISH';

export interface SpeciesProps {
  readonly id: string;
  readonly name: string;
  readonly category: SpeciesCategory;
  readonly defaultDensityMin: number | null;
  readonly defaultDensityMax: number | null;
}

export class Species {
  private constructor(private readonly props: SpeciesProps) {}

  static reconstitute(props: SpeciesProps): Species {
    return new Species(props);
  }

  get id(): string {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get category(): SpeciesCategory {
    return this.props.category;
  }

  get defaultDensityMin(): number | null {
    return this.props.defaultDensityMin;
  }

  get defaultDensityMax(): number | null {
    return this.props.defaultDensityMax;
  }
}
