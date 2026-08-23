import { ProjectRole } from '../../../shared-kernel/tenant/membership-resolver.port';

/**
 * Data-driven role → capability table (TASK-010, MOD-02 F3/§4.5/§6.3). The **single source of
 * truth** for role policy — downstream modules must use {@link rolesWithCapability} rather than
 * re-encoding allow-lists (module doc §6.3).
 *
 * **INVESTOR** (finance-focused): finance + reports + project overview/portfolio only — no
 * day-to-day operations (feed/water/tasks/camera/…), no writes.
 */
export interface RoleCapabilities {
  /** May invite/assign/remove members of the project. */
  readonly canManageMembers: boolean;
  /** May perform any state-changing action on the project (Partner/Investor are read-only, R5). */
  readonly canWrite: boolean;
  /** May view finance (hidden from Worker). */
  readonly canAccessFinanceSettings: boolean;
  /** May update the project aggregate itself — name/address/status (TASK-011, MOD-03 R1). */
  readonly canManageProjectSettings: boolean;
  /** May record a treatment (TASK-028). */
  readonly canManageTreatments: boolean;
  /** May create inventory items and record receipts/adjustments (TASK-020). */
  readonly canManageInventory: boolean;
  /** May configure water-quality safe-range thresholds (TASK-023). */
  readonly canManageWaterThresholds: boolean;
  /** May define recurring tasks (TASK-041). */
  readonly canManageTasks: boolean;
  /** May record a financial transaction (TASK-032) — Owner only. */
  readonly canManageFinance: boolean;
  /** May view daily summary / reports (TASK-037). */
  readonly canAccessReports: boolean;
  /**
   * May view day-to-day operations surfaces (ponds, feed, water, tasks, camera, weather,
   * inventory, health, growth, harvest, alerts detail). Investor is false — finance-focused.
   */
  readonly canAccessOperations: boolean;
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
    canManageFinance: true,
    canAccessReports: true,
    canAccessOperations: true,
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
    canManageFinance: false,
    canAccessReports: false,
    canAccessOperations: true,
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
    canManageFinance: false,
    canAccessReports: true,
    canAccessOperations: true,
  },
  INVESTOR: {
    canManageMembers: false,
    canWrite: false,
    canAccessFinanceSettings: true,
    canManageProjectSettings: false,
    canManageTreatments: false,
    canManageInventory: false,
    canManageWaterThresholds: false,
    canManageTasks: false,
    canManageFinance: false,
    canAccessReports: true,
    canAccessOperations: false,
  },
};

/** Every role that holds `capability` — the argument list for `@Roles()` on a real route. */
export function rolesWithCapability(capability: keyof RoleCapabilities): ProjectRole[] {
  return (Object.keys(ROLE_CAPABILITIES) as ProjectRole[]).filter(
    (role) => ROLE_CAPABILITIES[role][capability],
  );
}
