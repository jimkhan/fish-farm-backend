import { SetMetadata } from '@nestjs/common';

export const PROJECT_SCOPED_KEY = 'fms:project-scoped';

/**
 * Marks a route (or controller) as requiring a project scope even though its path carries no
 * `:projectId` param. The guard then rejects it with `SCOPE_REQUIRED`/400 instead of letting
 * it run unscoped (AC-005, MOD-01 edge case 3). Routes whose path contains `:projectId` are
 * enforced automatically and do not need this decorator.
 */
export const ProjectScoped = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PROJECT_SCOPED_KEY, true);
