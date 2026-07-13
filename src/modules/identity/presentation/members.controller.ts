import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ProjectMembership } from '../domain/project-membership.entity';
import { rolesWithCapability } from '../domain/role-capability-matrix';
import { InviteMemberUseCase } from '../application/invite-member.usecase';
import { ListMembersUseCase } from '../application/list-members.usecase';
import { RemoveMemberUseCase } from '../application/remove-member.usecase';
import { CreateMembershipDto } from './dtos/create-membership.dto';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

/** Wire shape of the `Membership` schema (contracts/openapi.yaml). */
interface MembershipResponse {
  id: string;
  userId: string;
  projectId: string;
  role: string;
}

function toResponse(membership: ProjectMembership): MembershipResponse {
  return {
    id: membership.id,
    userId: membership.userId,
    projectId: membership.projectId,
    role: membership.role,
  };
}

/**
 * `MembersController` (TASK-010, CON-010/011/012, AC-023). Every route requires `:projectId`, so
 * the global `ProjectScopeGuard` already resolved `request.tenant` before these run; `RolesGuard`
 * then enforces "Owner only" (§2.6) via the capability matrix rather than a hardcoded role.
 */
@Controller('projects/:projectId/members')
@UseGuards(RolesGuard)
@Roles(rolesWithCapability('canManageMembers'), 'Only the project owner can manage members.')
export class MembersController {
  constructor(
    private readonly listMembers: ListMembersUseCase,
    private readonly inviteMember: InviteMemberUseCase,
    private readonly removeMember: RemoveMemberUseCase,
  ) {}

  @Get()
  async listHandler(): Promise<MembershipResponse[]> {
    const memberships = await this.listMembers.execute();
    return memberships.map(toResponse);
  }

  @Post()
  async inviteHandler(@Body() body: CreateMembershipDto): Promise<MembershipResponse> {
    const membership = await this.inviteMember.execute(body.email, body.role);
    return toResponse(membership);
  }

  @Delete(':membershipId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeHandler(@Param('membershipId') membershipId: string): Promise<void> {
    await this.removeMember.execute(membershipId);
  }
}
