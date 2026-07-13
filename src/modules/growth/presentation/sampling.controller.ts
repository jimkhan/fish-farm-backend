import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { GetGrowthUseCase } from '../application/get-growth.usecase';
import { RecordSamplingUseCase } from '../application/record-sampling.usecase';
import { CreateSamplingDto } from './dtos/create-sampling.dto';
import { GrowthResponse, toGrowthResponse } from './dtos/growth.response';
import { SamplingResponse, toSamplingResponse } from './dtos/sampling.response';

/**
 * `SamplingController` (TASK-029, CON-020/052, AC-096/097). Recording is an operational write,
 * gated the same as mortality/stocking (`canWrite`); reading growth is open to any role
 * (Partner read-only, module doc §2.3).
 */
@Controller('projects/:projectId/batches/:batchId')
export class SamplingController {
  constructor(
    private readonly recordSampling: RecordSamplingUseCase,
    private readonly getGrowth: GetGrowthUseCase,
  ) {}

  @Post('samplings')
  @UseGuards(RolesGuard)
  @Roles(rolesWithCapability('canWrite'), 'Partners have read-only access.')
  async recordHandler(
    @Param('batchId') batchId: string,
    @Body() body: CreateSamplingDto,
  ): Promise<SamplingResponse> {
    const sampling = await this.recordSampling.execute(batchId, {
      sampleSize: body.sampleSize,
      avgWeightG: body.avgWeightG,
      sampledOn: new Date(body.sampledOn),
      clientMutationId: body.clientMutationId,
    });
    return toSamplingResponse(sampling);
  }

  @Get('growth')
  async growthHandler(@Param('batchId') batchId: string): Promise<GrowthResponse> {
    const result = await this.getGrowth.execute(batchId);
    return toGrowthResponse(result);
  }
}
