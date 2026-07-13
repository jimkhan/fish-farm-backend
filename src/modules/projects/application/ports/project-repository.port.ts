import { Project } from '../../domain/project.entity';

export interface ProjectListPage {
  readonly data: Project[];
  readonly nextCursor: string | null;
}

/**
 * `Project` is not itself project-owned — it IS the tenant boundary, so there is no
 * `project_id` to scope it by. A plain (unscoped) repository, like `UserRepositoryPort` (TASK-008).
 */
export interface ProjectRepositoryPort {
  findById(id: string): Promise<Project | null>;
  /** `projectIds` among the caller's memberships (CON-006), keyset-paginated by `createdAt, id`. */
  findPage(projectIds: string[], cursor: string | null, limit: number): Promise<ProjectListPage>;
  save(project: Project): Promise<Project>;
}

export const PROJECT_REPOSITORY = 'ProjectRepositoryPort';
