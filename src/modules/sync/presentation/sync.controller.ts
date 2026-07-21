import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { UnauthenticatedError } from '../../../shared-kernel/errors/domain-error';
import { MutationDispatcher } from '../application/mutation-dispatcher.service';
import { SyncRequestDto } from './dtos/sync-request.dto';
import { SyncResponse } from './dtos/sync-response';

interface RequestWithUser {
  user?: { id: string };
}

/**
 * `POST /sync` (TASK-040, CON-040, F3). No `:projectId` — `ProjectScopeGuard` passes it through
 * untouched (same shape as `/me`/`/portfolio/summary`), so authentication is checked directly
 * here; per-mutation project membership/role is `MutationDispatcher`'s job (each mutation's
 * `payload.projectId` can differ in principle, even though a real worker app only ever sends
 * its own bound project, R1).
 */
@Controller('sync')
export class SyncController {
  constructor(private readonly dispatcher: MutationDispatcher) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async syncHandler(@Req() req: RequestWithUser, @Body() body: SyncRequestDto): Promise<SyncResponse> {
    if (!req.user) {
      throw new UnauthenticatedError();
    }
    const results = await this.dispatcher.processBatch(body.mutations);
    return { results };
  }
}
