import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { CreateTaskUseCase } from '../application/create-task.usecase';
import { DeleteTaskUseCase } from '../application/delete-task.usecase';
import { ListTasksUseCase } from '../application/list-tasks.usecase';
import { UpdateTaskUseCase } from '../application/update-task.usecase';
import { CreateTaskDto } from './dtos/create-task.dto';
import { UpdateTaskDto } from './dtos/update-task.dto';
import { TaskResponse, toTaskResponse } from './dtos/task.response';

/**
 * `TasksController` (TASK-041, CON-029/030, AC-134). List is open to any role (Partner
 * read-only); create/update/delete are Owner-only (`canManageTasks`).
 */
@Controller('projects/:projectId/tasks')
export class TasksController {
  constructor(
    private readonly listTasks: ListTasksUseCase,
    private readonly createTask: CreateTaskUseCase,
    private readonly updateTask: UpdateTaskUseCase,
    private readonly deleteTask: DeleteTaskUseCase,
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
      dueOn: body.dueOn,
      assigneeUserId: body.assigneeUserId,
    });
    return toTaskResponse(task);
  }

  @Patch(':taskId')
  @UseGuards(RolesGuard)
  @Roles(rolesWithCapability('canManageTasks'), 'Only the Owner manages task definitions.')
  async updateHandler(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() body: UpdateTaskDto,
  ): Promise<TaskResponse> {
    const task = await this.updateTask.execute({
      taskId,
      title: body.title,
      pondId: body.pondId,
      recurrenceDays: body.recurrenceDays,
      dueOn: body.dueOn,
      assigneeUserId: body.assigneeUserId,
    });
    return toTaskResponse(task);
  }

  @Delete(':taskId')
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles(rolesWithCapability('canManageTasks'), 'Only the Owner manages task definitions.')
  async deleteHandler(@Param('taskId', ParseUUIDPipe) taskId: string): Promise<void> {
    await this.deleteTask.execute(taskId);
  }
}
