import { Inject, Injectable } from '@nestjs/common';
import { Pond } from '../domain/pond.entity';
import { POND_REPOSITORY, PondRepositoryPort } from './ports/pond-repository.port';

/** `GET /projects/{projectId}/ponds` (CON-013). Member-only (any role) — `ProjectScopeGuard` already ran. */
@Injectable()
export class ListPondsUseCase {
  constructor(@Inject(POND_REPOSITORY) private readonly ponds: PondRepositoryPort) {}

  async execute(): Promise<Pond[]> {
    return this.ponds.findAllInCurrentProject();
  }
}
