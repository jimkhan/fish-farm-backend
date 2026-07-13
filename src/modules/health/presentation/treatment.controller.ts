import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { RecordTreatmentUseCase } from '../application/record-treatment.usecase';
import { CreateTreatmentDto } from './dtos/create-treatment.dto';
import { TreatmentResponse, toTreatmentResponse } from './dtos/treatment.response';

/**
 * `TreatmentController` (TASK-028, CON-051, AC-101). Owner-only (`canManageTreatments` —
 * module doc §2.3, distinct from the Worker-accessible `canWrite` mortality/sampling routes).
 */
@Controller('projects/:projectId/batches/:batchId/treatments')
@UseGuards(RolesGuard)
@Roles(rolesWithCapability('canManageTreatments'), 'Only the Owner records treatments.')
export class TreatmentController {
  constructor(private readonly recordTreatment: RecordTreatmentUseCase) {}

  @Post()
  async recordHandler(
    @Param('batchId') batchId: string,
    @Body() body: CreateTreatmentDto,
  ): Promise<TreatmentResponse> {
    const treatment = await this.recordTreatment.execute(batchId, {
      product: body.product,
      dose: body.dose,
      administeredOn: new Date(body.administeredOn),
      withdrawalDays: body.withdrawalDays,
    });
    return toTreatmentResponse(treatment);
  }
}
