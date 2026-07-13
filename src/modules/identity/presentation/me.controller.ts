import { Controller, Get, Req } from '@nestjs/common';
import { UnauthenticatedError } from '../../../shared-kernel/errors/domain-error';
import { GetMeUseCase } from '../application/get-me.usecase';
import { MeResult } from '../application/me.result';

interface RequestWithUser {
  user?: { id: string };
}

/**
 * `GET /me` (CON-005, AC-021). No `:projectId` — `ProjectScopeGuard` lets it through untouched,
 * so authentication is checked here directly rather than via the project-scope mechanism.
 */
@Controller()
export class MeController {
  constructor(private readonly getMe: GetMeUseCase) {}

  @Get('me')
  async meHandler(@Req() req: RequestWithUser): Promise<MeResult> {
    if (!req.user) {
      throw new UnauthenticatedError();
    }
    return this.getMe.execute(req.user.id);
  }
}
