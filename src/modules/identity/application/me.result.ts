import { ProjectRole } from '../../../shared-kernel/tenant/membership-resolver.port';

/** Wire shape of the `Me` schema (contracts/openapi.yaml, CON-005). */
export interface MeResult {
  readonly user: { id: string; email: string; name: string };
  readonly memberships: ReadonlyArray<{
    id: string;
    userId: string;
    projectId: string;
    role: ProjectRole;
  }>;
}
