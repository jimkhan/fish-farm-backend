import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { LogMortalityUseCase } from '../application/log-mortality.usecase';
import { CreateMortalityDto } from './dtos/create-mortality.dto';
import { MortalityResponse, toMortalityResponse } from './dtos/mortality.response';

/**
 * `MortalityController` (TASK-028, CON-019, AC-094). `ProjectScopeGuard` already validated
 * membership; logging a mortality is an operational write, gated the same as stocking/pond
 * creation (`canWrite` — Partners are read-only everywhere, MOD-02 R5).
 */
@Controller('projects/:projectId/batches/:batchId/mortalities')
@UseGuards(RolesGuard)
@Roles(rolesWithCapability('canWrite'), 'Partners have read-only access.')
export class MortalityController {
  constructor(private readonly logMortality: LogMortalityUseCase) {}

  @Post()
  async logHandler(
    @Param('batchId') batchId: string,
    @Body() body: CreateMortalityDto,
  ): Promise<MortalityResponse> {
    const mortality = await this.logMortality.execute(batchId, {
      count: body.count,
      causeCategory: body.causeCategory,
      photoUrl: body.photoUrl,
      occurredAt: new Date(body.occurredAt),
      clientMutationId: body.clientMutationId,
    });
    return toMortalityResponse(mortality);
  }
}
