import { Inject, Injectable } from '@nestjs/common';
import {
  PROJECT_MEMBERS_DIRECTORY,
  ProjectMembersDirectoryPort,
} from '../../identity/application/ports/project-members-directory.port';
import { AlertType, OPERATIONAL_ALERT_TYPES } from '../domain/alert.entity';

/**
 * R2 recipient policy (TASK-015, "recipient policy" — the delivery-target computation; TASK-016
 * owns actually dispatching to these userIds). Owner always receives every alert; Worker receives
 * only operational types on their one project; Partner is a read-only viewer, never a recipient.
 */
@Injectable()
export class RecipientResolver {
  constructor(
    @Inject(PROJECT_MEMBERS_DIRECTORY) private readonly members: ProjectMembersDirectoryPort,
  ) {}

  async resolve(projectId: string, alertType: AlertType): Promise<string[]> {
    const memberships = await this.members.findActiveByProjectId(projectId);
    const isOperational = OPERATIONAL_ALERT_TYPES.includes(alertType);

    return memberships
      .filter((m) => m.role === 'OWNER' || (m.role === 'WORKER' && isOperational))
      .map((m) => m.userId);
  }
}
