import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import {
  PROJECT_REPOSITORY,
  ProjectRepositoryPort,
} from '../../projects/application/ports/project-repository.port';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { Pond } from '../domain/pond.entity';
import { POND_REPOSITORY, PondRepositoryPort } from './ports/pond-repository.port';

export interface CreatePondInput {
  readonly name: string;
  readonly area: number;
  readonly depthM?: number;
  readonly notes?: string;
}

/**
 * `POST /projects/{projectId}/ponds` (CON-014, FT-018, AC-060/069). AC-060 says "an authorized
 * member" (not "an Owner") — gated by the `canWrite` capability at the controller (`RolesGuard`),
 * same as any other operational write; Partners are read-only everywhere (MOD-02 R5).
 */
@Injectable()
export class CreatePondUseCase {
  constructor(
    @Inject(POND_REPOSITORY) private readonly ponds: PondRepositoryPort,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    private readonly tenant: TenantContext,
  ) {}

  async execute(input: CreatePondInput): Promise<Pond> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    if (project.isClosed) {
      throw new ProjectClosedError();
    }

    const pond = Pond.reconstitute({
      id: randomUUID(),
      projectId: this.tenant.projectId,
      name: input.name,
      area: input.area,
      depthM: input.depthM ?? null,
      notes: input.notes ?? null,
      createdAt: new Date(),
    });
    return this.ponds.save(pond);
  }
}
