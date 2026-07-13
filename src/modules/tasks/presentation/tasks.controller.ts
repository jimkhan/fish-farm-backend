import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { CreateTaskUseCase } from '../application/create-task.usecase';
import { ListTasksUseCase } from '../application/list-tasks.usecase';
import { CreateTaskDto } from './dtos/create-task.dto';
import { TaskResponse, toTaskResponse } from './dtos/task.response';

/**
 * `TasksController` (TASK-041, CON-029/030, AC-134). List is open to any role (Partner
 * read-only); create is Owner-only per CON-030's own contract description ("OWNER").
 */
@Controller('projects/:projectId/tasks')
export class TasksController {
  constructor(
    private readonly listTasks: ListTasksUseCase,
    private readonly createTask: CreateTaskUseCase,
  ) {}

  @Get()
  async listHandler(): Promise<TaskResponse[]> {
    const tasks = await this.listTasks.execute();
    return tasks.map(toTaskResponse);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(rolesWithCapability('canManageTasks'), 'Only the Owner defines tasks.')
  async createHandler(@Body() body: CreateTaskDto): Promise<TaskResponse> {
    const task = await this.createTask.execute({
      title: body.title,
      pondId: body.pondId,
      recurrenceDays: body.recurrenceDays,
    });
    return toTaskResponse(task);
  }
}
