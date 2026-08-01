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
import { rolesWithCapability } from '../domain/role-capability-matrix';
import { InviteMemberUseCase } from '../application/invite-member.usecase';
import { ListMembersUseCase } from '../application/list-members.usecase';
import { MemberView } from '../application/member-view';
import { RemoveMemberUseCase } from '../application/remove-member.usecase';
import { CreateMembershipDto } from './dtos/create-membership.dto';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

/** Wire shape of the `Membership` schema (contracts/openapi.yaml) — includes the member's
 * identity (email/name) so the owner Members UI can show who each member is (TASK-047). */
interface MembershipResponse {
  id: string;
  userId: string;
  projectId: string;
  role: string;
  email: string;
  name: string;
}

function toResponse(member: MemberView): MembershipResponse {
  return {
    id: member.id,
    userId: member.userId,
    projectId: member.projectId,
    role: member.role,
    email: member.email,
    name: member.name,
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
