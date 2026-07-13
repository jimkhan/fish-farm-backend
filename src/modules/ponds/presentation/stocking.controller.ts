import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { RecordStockingUseCase } from '../application/record-stocking.usecase';
import { CreateStockingDto } from './dtos/create-stocking.dto';
import { BatchResponse, toBatchResponse } from './dtos/batch.response';

/**
 * `StockingController` (TASK-019, CON-015, AC-062). `ProjectScopeGuard` already validated
 * membership; recording a stocking is an operational write, gated the same as pond creation
 * (`canWrite` — Partners are read-only everywhere, MOD-02 R5).
 */
@Controller('projects/:projectId/ponds/:pondId/stockings')
@UseGuards(RolesGuard)
@Roles(rolesWithCapability('canWrite'), 'Partners have read-only access.')
export class StockingController {
  constructor(private readonly recordStocking: RecordStockingUseCase) {}

  @Post()
  async recordHandler(
    @Param('pondId') pondId: string,
    @Body() body: CreateStockingDto,
  ): Promise<BatchResponse> {
    const batch = await this.recordStocking.execute(pondId, {
      speciesId: body.speciesId,
      source: body.source,
      hatcheryName: body.hatcheryName,
      count: body.count,
      stockedOn: new Date(body.stockedOn),
      stockingCostMinor: body.stockingCost?.amountMinor,
    });
    return toBatchResponse(batch);
  }
}
