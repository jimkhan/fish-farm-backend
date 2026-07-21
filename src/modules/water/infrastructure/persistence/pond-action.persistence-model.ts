import { Column, Entity, Index } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../../../../platform/persistence/base-project-owned.persistence-model';
import { PondActionType } from '../../domain/pond-action.entity';

/** `pond_action` table (TASK-025, ERD `POND_ACTION`). Project-owned (R9). */
@Entity('pond_action')
export class PondActionPersistenceModel extends BaseProjectOwnedPersistenceModel {
  @Index()
  @Column('uuid', { name: 'pond_id' })
  pondId!: string;

  @Column('varchar', { name: 'action_type' })
  actionType!: PondActionType;

  @Index()
  @Column('timestamptz', { name: 'performed_at' })
  performedAt!: Date;

  @Column('varchar', { nullable: true })
  notes!: string | null;

  @Index({ unique: true })
  @Column('varchar', { name: 'client_mutation_id' })
  clientMutationId!: string;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
