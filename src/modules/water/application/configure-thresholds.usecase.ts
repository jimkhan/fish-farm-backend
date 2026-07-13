import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import {
  PROJECT_REPOSITORY,
  ProjectRepositoryPort,
} from '../../projects/application/ports/project-repository.port';
import { ProjectClosedError } from '../../projects/domain/project-errors';
import { WaterParameter } from '../domain/water-reading.entity';
import { WaterThreshold } from '../domain/water-threshold.entity';
import {
  WATER_THRESHOLD_REPOSITORY,
  WaterThresholdRepositoryPort,
} from './ports/water-threshold-repository.port';

export interface ConfigureThresholdInput {
  readonly parameter: WaterParameter;
  readonly min?: number | null;
  readonly max?: number | null;
  readonly critical?: number | null;
}

/**
 * `PUT /projects/{projectId}/water-thresholds` (CON-027, FT-033, AC-085, R2/R8/R9). Owner-only
 * per the contract's own description ("OWNER"). Upserts one row per submitted parameter — a
 * partial submission (e.g. just `DO`) only overrides that parameter; the rest keep using seeded
 * defaults (`GetThresholdsUseCase`) until explicitly configured.
 */
@Injectable()
export class ConfigureThresholdsUseCase {
  constructor(
    @Inject(WATER_THRESHOLD_REPOSITORY) private readonly thresholds: WaterThresholdRepositoryPort,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepositoryPort,
    private readonly tenant: TenantContext,
  ) {}

  async execute(inputs: ConfigureThresholdInput[]): Promise<WaterThreshold[]> {
    const project = await this.projects.findById(this.tenant.projectId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }
    if (project.isClosed) {
      throw new ProjectClosedError();
    }

    const saved: WaterThreshold[] = [];
    for (const input of inputs) {
      if (input.min == null && input.max == null) {
        throw new ValidationError('A threshold needs at least a min or a max bound.');
      }

      const existing = await this.thresholds.findByParameter(input.parameter);
      const threshold = WaterThreshold.reconstitute({
        id: existing?.id ?? randomUUID(),
        projectId: this.tenant.projectId,
        parameter: input.parameter,
        min: input.min ?? null,
        max: input.max ?? null,
        critical: input.critical ?? null,
      });
      saved.push(await this.thresholds.save(threshold));
    }

    return saved;
  }
}
