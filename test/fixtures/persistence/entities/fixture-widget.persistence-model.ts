import { Column, Entity } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../src/platform/persistence/base-project-owned.persistence-model';

/**
 * Test-only fixture proving `BaseProjectOwnedPersistenceModel` behaves correctly for a concrete
 * subclass (id + indexed project_id). Not a real business entity — TASK-002 ships no business
 * tables; real modules add their own `*.persistence-model.ts` under their own
 * `infrastructure/persistence/`.
 */
@Entity('_fixture_widget')
export class FixtureWidgetPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Column()
  name!: string;
}
