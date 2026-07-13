import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { CreateInventoryItemUseCase } from '../application/create-item.usecase';
import { ListInventoryUseCase } from '../application/list-inventory.usecase';
import { CreateInventoryItemDto } from './dtos/create-inventory-item.dto';
import { InventoryItemResponse, toInventoryItemResponse } from './dtos/inventory-item.response';

/**
 * `InventoryController` (TASK-020, CON-022/023, AC-078). `ProjectScopeGuard` already validated
 * membership; list is open to any role (Partner views read-only, module doc §2.3); create is
 * Owner-only per CON-023's own contract description ("OWNER").
 */
@Controller('projects/:projectId/inventory')
export class InventoryController {
  constructor(
    private readonly listInventory: ListInventoryUseCase,
    private readonly createItem: CreateInventoryItemUseCase,
  ) {}

  @Get()
  async listHandler(): Promise<InventoryItemResponse[]> {
    const items = await this.listInventory.execute();
    return items.map(toInventoryItemResponse);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(rolesWithCapability('canManageInventory'), 'Only the Owner manages inventory items.')
  async createHandler(@Body() body: CreateInventoryItemDto): Promise<InventoryItemResponse> {
    const item = await this.createItem.execute({
      name: body.name,
      feedType: body.feedType,
      unit: body.unit,
      lowStockThreshold: body.lowStockThreshold,
    });
    return toInventoryItemResponse(item);
  }
}
