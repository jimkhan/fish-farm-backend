import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { RecordInventoryTxnUseCase } from '../application/record-txn.usecase';
import { CreateInventoryTxnDto } from './dtos/create-inventory-txn.dto';
import { InventoryTxnResponse, toInventoryTxnResponse } from './dtos/inventory-txn.response';

/**
 * `InventoryTxnController` (TASK-020, CON-024, AC-079/080/082). Owner-only, same
 * `canManageInventory` gate as item creation — manual receipts/adjustments (automatic feeding
 * deductions are a separate path TASK-022 adds later, per the contract's own description:
 * "Deductions are created automatically by feeding logs").
 */
@Controller('projects/:projectId/inventory/:itemId/transactions')
@UseGuards(RolesGuard)
@Roles(rolesWithCapability('canManageInventory'), 'Only the Owner manages inventory items.')
export class InventoryTxnController {
  constructor(private readonly recordTxn: RecordInventoryTxnUseCase) {}

  @Post()
  async recordHandler(
    @Param('itemId') itemId: string,
    @Body() body: CreateInventoryTxnDto,
  ): Promise<InventoryTxnResponse> {
    const txn = await this.recordTxn.execute(itemId, {
      delta: body.delta,
      reason: body.reason,
      costMinor: body.cost?.amountMinor,
    });
    return toInventoryTxnResponse(txn);
  }
}
