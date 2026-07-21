import { Controller, Get, Param } from '@nestjs/common';
import { GetPondFcrUseCase } from '../application/get-pond-fcr.usecase';
import { PondFcrResponse, toPondFcrResponse } from './dtos/pond-fcr.response';

/**
 * `FcrController` (TASK-030, CON-058, AC-098/099). Member-only (any role) — reads only, same
 * pattern as `BiomassController`/`SamplingController.growthHandler`.
 */
@Controller('projects/:projectId/ponds/:pondId')
export class FcrController {
  constructor(private readonly getPondFcr: GetPondFcrUseCase) {}

  @Get('fcr')
  async fcrHandler(@Param('pondId') pondId: string): Promise<PondFcrResponse> {
    const result = await this.getPondFcr.execute(pondId);
    return toPondFcrResponse(result);
  }
}
