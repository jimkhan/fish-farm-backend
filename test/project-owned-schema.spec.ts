import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { getMetadataArgsStorage } from 'typeorm';
import { BaseProjectOwnedPersistenceModel } from '../src/platform/persistence/base-project-owned.persistence-model';

/**
 * Schema test for MOD-01 R1 / AC-010: every project-owned persistence model carries an indexed
 * `project_id`. Enforced structurally — a `*.persistence-model.ts` class must extend
 * `BaseProjectOwnedPersistenceModel` (which contributes the column + index) unless it is
 * explicitly listed as a platform/reference table below.
 */

/**
 * Tables that are deliberately NOT project-owned (ERD.md §2 note: platform/shared-kernel and
 * global reference tables). Add a class name here consciously — it is a review decision.
 * Expected future entries: User, Species, PasswordResetToken, RefreshToken, DeviceToken.
 */
const NON_PROJECT_OWNED_ALLOWLIST: string[] = [
  // audit_entry: project_id is nullable (platform-level actions), TASK-005 / ERD §2 note
  'AuditEntryPersistenceModel',
  // user: global entity, no project_id at all (ERD USER); refresh_token: scoped to a user, not
  // a project (ERD REFRESH_TOKEN). TASK-008.
  'UserPersistenceModel',
  'RefreshTokenPersistenceModel',
  // password_reset_token: scoped to a user, not a project (ERD PasswordResetToken). TASK-009.
  'PasswordResetTokenPersistenceModel',
  // project: IS the tenant/isolation boundary — has no project_id of its own (ERD PROJECT). TASK-011.
  'ProjectPersistenceModel',
  // species: global seeded reference data, not project-scoped (ERD SPECIES, MOD-04 R8). TASK-018.
  'SpeciesPersistenceModel',
  // device_token: scoped to a user across every project they're a member of, not one project
  // (ERD DEVICE_TOKEN); delivery_attempt: scoped to an alert/device, same shape. TASK-016.
  'DeviceTokenPersistenceModel',
  'DeliveryAttemptPersistenceModel',
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      out.push(...walk(full));
    } else if (full.endsWith('.persistence-model.ts')) {
      out.push(full);
    }
  }
  return out;
}

type ModelClass = new () => object;

function loadModelClasses(): Array<{ file: string; name: string; ctor: ModelClass }> {
  const roots = [join(__dirname, '..', 'src'), join(__dirname, 'fixtures')];
  const classes: Array<{ file: string; name: string; ctor: ModelClass }> = [];
  for (const root of roots) {
    for (const file of walk(root)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const exported = require(file) as Record<string, unknown>;
      for (const [name, value] of Object.entries(exported)) {
        if (typeof value === 'function' && value !== BaseProjectOwnedPersistenceModel) {
          classes.push({ file, name, ctor: value as ModelClass });
        }
      }
    }
  }
  return classes;
}

describe('Project-owned schema invariant (TASK-004, AC-010, MOD-01 R1)', () => {
  const models = loadModelClasses();

  it('finds at least one persistence model to check (fixture widget)', () => {
    expect(models.map((m) => m.name)).toContain('FixtureWidgetPersistenceModel');
  });

  it('every persistence model extends the project-owned base or is explicitly allowlisted', () => {
    const offenders = models.filter(
      (m) =>
        !(m.ctor.prototype instanceof BaseProjectOwnedPersistenceModel) &&
        !NON_PROJECT_OWNED_ALLOWLIST.includes(m.name),
    );
    expect(
      offenders.map((o) => `${o.name} (${o.file})`),
    ).toEqual([]);
  });

  it('the base contributes an indexed project_id column to every subclass (AC-010)', () => {
    const storage = getMetadataArgsStorage();

    const projectIdColumn = storage.columns.find(
      (c) =>
        c.target === BaseProjectOwnedPersistenceModel &&
        c.options.name === 'project_id',
    );
    expect(projectIdColumn).toBeDefined();

    const projectIdIndex = storage.indices.find(
      (i) => i.target === BaseProjectOwnedPersistenceModel,
    );
    expect(projectIdIndex).toBeDefined();
  });
});
