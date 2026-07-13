import { Column, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Base persistence model every project-owned TypeORM entity extends (ADR-007). Never applied
 * to a domain class — this lives in infrastructure, mapped to/from a pure domain entity by an
 * explicit mapper (CLAUDE.md invariant #3). Carries an indexed `project_id` so the scoped-
 * repository base (TASK-004) can filter uniformly and cheaply on every project-owned table,
 * even when the row is only reachable via a pond/batch (NFR-011).
 *
 * Concrete subclasses add `@Entity('table_name')` and their own columns; TypeORM flattens this
 * base class's columns onto the child table (no separate base table).
 */
export abstract class BaseProjectOwnedPersistenceModel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column('uuid', { name: 'project_id' })
  projectId!: string;
}
