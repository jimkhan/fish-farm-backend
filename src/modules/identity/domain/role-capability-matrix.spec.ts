import { rolesWithCapability, ROLE_CAPABILITIES } from './role-capability-matrix';

describe('Role capability matrix (TASK-010/TASK-011, MOD-02 F3/§6.3, AC-023/025/026, MOD-03 R1)', () => {
  it('OWNER can manage members/project settings/treatments/inventory/water thresholds/tasks, write, finance, reports, and operations', () => {
    expect(ROLE_CAPABILITIES.OWNER).toEqual({
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
    });
  });

  it('WORKER can write + operations but not finance/settings/reports (AC-026)', () => {
    expect(ROLE_CAPABILITIES.WORKER).toEqual({
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
    });
  });

  it('PARTNER is read-only with finance, reports, and operations (AC-025)', () => {
    expect(ROLE_CAPABILITIES.PARTNER).toEqual({
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
    });
  });

  it('INVESTOR is finance-focused: finance + reports only — no operations, no writes', () => {
    expect(ROLE_CAPABILITIES.INVESTOR).toEqual({
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
    });
  });

  it('rolesWithCapability derives the exact allow-list for each capability', () => {
    expect(rolesWithCapability('canManageMembers')).toEqual(['OWNER']);
    expect(rolesWithCapability('canManageProjectSettings')).toEqual(['OWNER']);
    expect(rolesWithCapability('canManageTreatments')).toEqual(['OWNER']);
    expect(rolesWithCapability('canManageInventory')).toEqual(['OWNER']);
    expect(rolesWithCapability('canManageWaterThresholds')).toEqual(['OWNER']);
    expect(rolesWithCapability('canManageTasks')).toEqual(['OWNER']);
    expect(rolesWithCapability('canManageFinance')).toEqual(['OWNER']);
    expect(rolesWithCapability('canWrite').sort()).toEqual(['OWNER', 'WORKER'].sort());
    expect(rolesWithCapability('canAccessFinanceSettings').sort()).toEqual(
      ['OWNER', 'PARTNER', 'INVESTOR'].sort(),
    );
    expect(rolesWithCapability('canAccessReports').sort()).toEqual(
      ['OWNER', 'PARTNER', 'INVESTOR'].sort(),
    );
    expect(rolesWithCapability('canAccessOperations').sort()).toEqual(
      ['OWNER', 'WORKER', 'PARTNER'].sort(),
    );
  });
});
