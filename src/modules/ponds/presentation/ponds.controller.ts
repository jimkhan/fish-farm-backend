import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { CreatePondUseCase } from '../application/create-pond.usecase';
import { ListPondsUseCase } from '../application/list-ponds.usecase';
import { Pond } from '../domain/pond.entity';
import { CreatePondDto } from './dtos/create-pond.dto';

/** Wire shape of the `Pond` schema (contracts/openapi.yaml). */
interface PondResponse {
  id: string;
  projectId: string;
  name: string;
  area: number;
  depthM: number | null;
  notes: string | null;
}

function toResponse(pond: Pond): PondResponse {
  return {
    id: pond.id,
    projectId: pond.projectId,
    name: pond.name,
    area: pond.area,
    depthM: pond.depthM,
    notes: pond.notes,
  };
}

/**
 * `PondsController` (TASK-018, CON-013/014, AC-060/061/069). `ProjectScopeGuard` (global) already
 * validated membership. Create requires `canWrite` (AC-060 says "an authorized member," not
 * "Owner" — Partners are read-only everywhere, MOD-02 R5); list is open to any member role.
 */
@Controller('projects/:projectId/ponds')
export class PondsController {
  constructor(
    private readonly listPonds: ListPondsUseCase,
    private readonly createPond: CreatePondUseCase,
  ) {}

  @Get()
  async listHandler(): Promise<PondResponse[]> {
    const ponds = await this.listPonds.execute();
    return ponds.map(toResponse);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(rolesWithCapability('canWrite'), 'Partners have read-only access.')
  async createHandler(@Body() body: CreatePondDto): Promise<PondResponse> {
    const pond = await this.createPond.execute(body);
    return toResponse(pond);
  }
}
