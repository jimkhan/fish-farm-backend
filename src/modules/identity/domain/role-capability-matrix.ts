import { ProjectRole } from '../../../shared-kernel/tenant/membership-resolver.port';

/**
 * Data-driven role → capability table (TASK-010, MOD-02 F3/§4.5/§6.3). The **single source of
 * truth** for "Worker: no finance/settings" and "Partner: read-only" — downstream modules
 * (e.g. MOD-08 finance) must translate their own `@Roles()` allow-lists from this table via
 * {@link rolesWithCapability} rather than re-encoding the rule, so the policy can't drift module
 * to module (module doc §6.3 risk note).
 */
export interface RoleCapabilities {
  /** May invite/assign/remove members of the project. */
  readonly canManageMembers: boolean;
  /** May perform any state-changing action on the project (Partner is read-only, R5). */
  readonly canWrite: boolean;
  /** May view/act on finance or settings (hidden from Worker, R… / FR-004). */
  readonly canAccessFinanceSettings: boolean;
  /** May update the project aggregate itself — name/address/status (TASK-011, MOD-03 R1). */
  readonly canManageProjectSettings: boolean;
  /**
   * May record a treatment (TASK-028, MOD-07 §2.3 — "Owner (web): ...record treatments" is
   * distinct from Worker's operational mortality/sampling logging).
   */
  readonly canManageTreatments: boolean;
  /**
   * May create inventory items and record receipts/adjustments (TASK-020, MOD-05 §2.3 —
   * "Owner... inventory items + thresholds"; CON-023's own description names OWNER explicitly).
   * Worker's only inventory-affecting path is the automatic feeding deduction TASK-022 adds.
   */
  readonly canManageInventory: boolean;
  /**
   * May configure water-quality safe-range thresholds (TASK-023, MOD-06 §2.3 — "Owner (web):
   * configure thresholds..."; CON-027's own description names OWNER explicitly).
   */
  readonly canManageWaterThresholds: boolean;
  /**
   * May define recurring tasks (TASK-041, MOD-12 — CON-030's own contract description names
   * OWNER explicitly). Worker's task interaction is completion (`canWrite`), not definition.
   */
  readonly canManageTasks: boolean;
}

export const ROLE_CAPABILITIES: Record<ProjectRole, RoleCapabilities> = {
  OWNER: {
    canManageMembers: true,
    canWrite: true,
    canAccessFinanceSettings: true,
    canManageProjectSettings: true,
    canManageTreatments: true,
    canManageInventory: true,
    canManageWaterThresholds: true,
    canManageTasks: true,
  },
  WORKER: {
    canManageMembers: false,
    canWrite: true,
    canAccessFinanceSettings: false,
    canManageProjectSettings: false,
    canManageTreatments: false,
    canManageInventory: false,
    canManageWaterThresholds: false,
    canManageTasks: false,
  },
  PARTNER: {
    canManageMembers: false,
    canWrite: false,
    canAccessFinanceSettings: true,
    canManageProjectSettings: false,
    canManageTreatments: false,
    canManageInventory: false,
    canManageWaterThresholds: false,
    canManageTasks: false,
  },
};

/** Every role that holds `capability` — the argument list for `@Roles()` on a real route. */
export function rolesWithCapability(capability: keyof RoleCapabilities): ProjectRole[] {
  return (Object.keys(ROLE_CAPABILITIES) as ProjectRole[]).filter(
    (role) => ROLE_CAPABILITIES[role][capability],
  );
}
