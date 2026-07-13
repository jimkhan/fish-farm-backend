import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { CompleteTaskUseCase } from '../application/complete-task.usecase';
import { CreateTaskLogDto } from './dtos/create-task-log.dto';
import { TaskLogResponse, toTaskLogResponse } from './dtos/task-log.response';

/**
 * `TaskLogsController` (TASK-041, CON-031, AC-134). Operational write, gated the same as
 * mortality/stocking/readings (`canWrite`) — Worker mobile completes tasks (module doc §2.3).
 */
@Controller('projects/:projectId/tasks/:taskId/logs')
@UseGuards(RolesGuard)
@Roles(rolesWithCapability('canWrite'), 'Partners have read-only access.')
export class TaskLogsController {
  constructor(private readonly completeTask: CompleteTaskUseCase) {}

  @Post()
  async completeHandler(
    @Param('taskId') taskId: string,
    @Body() body: CreateTaskLogDto,
  ): Promise<TaskLogResponse> {
    const taskLog = await this.completeTask.execute(taskId, {
      completedAt: new Date(body.completedAt),
      photoUrl: body.photoUrl,
      clientMutationId: body.clientMutationId,
    });
    return toTaskLogResponse(taskLog);
  }
}
