import { Body, Controller, Get, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { UnauthenticatedError } from '../../../shared-kernel/errors/domain-error';
import { rolesWithCapability } from '../../identity/domain/role-capability-matrix';
import { Roles } from '../../identity/presentation/roles.decorator';
import { RolesGuard } from '../../identity/presentation/roles.guard';
import { CreateProjectUseCase } from '../application/create-project.usecase';
import { GetProjectUseCase } from '../application/get-project.usecase';
import { ListProjectsUseCase } from '../application/list-projects.usecase';
import { UpdateProjectUseCase } from '../application/update-project.usecase';
import { Project } from '../domain/project.entity';
import { CreateProjectDto } from './dtos/create-project.dto';
import { ListProjectsQueryDto } from './dtos/list-projects-query.dto';
import { UpdateProjectDto } from './dtos/update-project.dto';

interface RequestWithUser {
  user?: { id: string };
}

/** Wire shape of the `Project` schema (contracts/openapi.yaml). */
interface ProjectResponse {
  id: string;
  name: string;
  siteLat: number;
  siteLng: number;
  address: string | null;
  currency: string;
  landUnit: string;
  status: string;
}

function toResponse(project: Project): ProjectResponse {
  return {
    id: project.id,
    name: project.name,
    siteLat: project.siteLat,
    siteLng: project.siteLng,
    address: project.address,
    currency: project.currency,
    landUnit: project.landUnit,
    status: project.status,
  };
}

/**
 * `ProjectsController` (TASK-011, CON-006/007/008/009). `GET`/`POST /projects` carry no
 * `:projectId` — `ProjectScopeGuard` passes them through untouched (like `/me`), so
 * authentication is checked here directly. `GET/PATCH /projects/:projectId` are project-scoped;
 * `PATCH` additionally requires `OWNER` (`canManageProjectSettings`, R1/AC-031).
 */
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly listProjects: ListProjectsUseCase,
    private readonly createProject: CreateProjectUseCase,
    private readonly getProject: GetProjectUseCase,
    private readonly updateProject: UpdateProjectUseCase,
  ) {}

  @Get()
  async listHandler(
    @Req() req: RequestWithUser,
    @Query() query: ListProjectsQueryDto,
  ): Promise<{ data: ProjectResponse[]; nextCursor: string | null }> {
    if (!req.user) {
      throw new UnauthenticatedError();
    }
    const page = await this.listProjects.execute(req.user.id, query.cursor ?? null, query.limit ?? 50);
    return { data: page.data.map(toResponse), nextCursor: page.nextCursor };
  }

  @Post()
  async createHandler(
    @Req() req: RequestWithUser,
    @Body() body: CreateProjectDto,
  ): Promise<ProjectResponse> {
    if (!req.user) {
      throw new UnauthenticatedError();
    }
    const project = await this.createProject.execute(req.user.id, body);
    return toResponse(project);
  }

  @Get(':projectId')
  async getHandler(): Promise<ProjectResponse> {
    const project = await this.getProject.execute();
    return toResponse(project);
  }

  @Patch(':projectId')
  @UseGuards(RolesGuard)
  @Roles(
    rolesWithCapability('canManageProjectSettings'),
    'Only an owner can manage projects.',
  )
  async updateHandler(@Body() body: UpdateProjectDto): Promise<ProjectResponse> {
    const project = await this.updateProject.execute(body);
    return toResponse(project);
  }
}
