import { IsEmail, IsIn } from 'class-validator';
import { ProjectRole } from '../../../../shared-kernel/tenant/membership-resolver.port';

/** `CreateMembership` schema (contracts/openapi.yaml, CON-011). */
export class CreateMembershipDto {
  @IsEmail()
  email!: string;

  @IsIn(['OWNER', 'WORKER', 'PARTNER'])
  role!: ProjectRole;
}
