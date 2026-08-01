/* eslint-disable no-console */
import 'reflect-metadata';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { AppDataSource } from './data-source';

/**
 * Development seed (NOT a migration). Populates a coherent, invariant-valid demo dataset so the
 * web AND mobile frontends can be built and exercised against real API responses across EVERY
 * flow. Idempotent: it only ever touches its OWN footprint (the fixed demo users by email + the
 * two fixed demo projects by id and every row scoped to them) — unrelated data is left untouched.
 *
 * Run with:  npm run seed
 *
 * ── Login accounts (dev password for all usable accounts):  Password123! ────────────────────────
 *   owner@fishfarm.test        OWNER   on Rupganj + Savar (full admin, finance)
 *   coowner@fishfarm.test      OWNER   on Rupganj (2nd owner → exercises last-owner-409 protection)
 *   partner@fishfarm.test      PARTNER on Rupganj (read-only: no finance write, no admin)
 *   partner2@fishfarm.test     PARTNER on Savar
 *   worker@fishfarm.test       WORKER  on Rupganj (mobile primary; no finance)
 *   worker2@fishfarm.test      WORKER  on Savar (single-project binding)
 *   reset@fishfarm.test        PARTNER on Savar — has an ACTIVE reset token (test reset-confirm)
 *   deactivated@fishfarm.test  PARTNER on Rupganj but user.status=DEACTIVATED (login is rejected)
 *   removed@fishfarm.test      ex-WORKER on Rupganj, membership REMOVED (soft-delete history)
 *   noproject@fishfarm.test    ACTIVE user with NO membership (empty-state / create-first-project)
 *
 * ── Invite / onboarding (no usable password — must set one via the reset link) ──────────────────
 *   invited@fishfarm.test      PARTNER on Rupganj, freshly invited → onboard with RESET_TOKEN_INVITED
 *
 * ── Ready-to-use secrets (also printed on completion) ───────────────────────────────────────────
 *   Password reset:  POST /auth/password-reset/confirm { token, newPassword }
 *     RESET_TOKEN_INVITED → onboards invited@      RESET_TOKEN_RESET → resets reset@
 *   Sensor ingestion:  POST /devices/{deviceId}/readings  header  X-Device-Key: <raw key>
 *     SENSOR_KEY_B3 (Rupganj B3)   SENSOR_KEY_S1 (Savar S1)
 */

// ── Fixed UUIDs (deterministic → idempotent, and easy for the frontend to reference) ────────────
const U = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SP = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PD = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ST = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BA = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const INV = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const HV = (n: number) => `80000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TK = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Extended footprint (comprehensive full-flow coverage) — distinct prefixes keep them addressable.
const AL = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`; // alerts
const CAM = (n: number) => `a1000000-0000-4000-8000-${String(n).padStart(12, '0')}`; // cameras
const WS = (n: number) => `a2000000-0000-4000-8000-${String(n).padStart(12, '0')}`; // weather snapshots
const TR = (n: number) => `a3000000-0000-4000-8000-${String(n).padStart(12, '0')}`; // treatments
const DTK = (n: number) => `a4000000-0000-4000-8000-${String(n).padStart(12, '0')}`; // device (push) tokens
const DA = (n: number) => `a5000000-0000-4000-8000-${String(n).padStart(12, '0')}`; // delivery attempts
const PA = (n: number) => `a6000000-0000-4000-8000-${String(n).padStart(12, '0')}`; // pond actions
const DEV = (n: number) => `a7000000-0000-4000-8000-${String(n).padStart(12, '0')}`; // sensor devices
const PRT = (n: number) => `a8000000-0000-4000-8000-${String(n).padStart(12, '0')}`; // password reset tokens

const OWNER = U(1);
const PARTNER = U(2);
const WORKER = U(3);
const COOWNER = U(4);
const WORKER2 = U(5);
const PARTNER2 = U(6);
const INVITED = U(7);
const RESET_USER = U(8);
const DEACTIVATED = U(9);
const REMOVED_USER = U(10);
const NOPROJECT = U(11);
const RUPGANJ = P(1);
const SAVAR = P(2);
const TILAPIA = SP(1);
const PRAWN = SP(2);
// Ponds: A2, J1, B3, C1 (the four grow-out ponds) + H1 (harvest-ready) on Rupganj; S1 on Savar.
const PONDS = {
  A2: PD(1),
  J1: PD(2),
  B3: PD(3),
  C1: PD(4),
  H1: PD(5),
  S1: PD(6),
};

const DEV_PASSWORD = 'Password123!';
const taka = (n: number) => Math.round(n * 100); // → integer minor units (poisha)

// Opaque secrets handed to the client raw and stored server-side only as a SHA-256 digest
// (same scheme as `token-hash.util.ts` and the device-key guard). Fixed here so the frontend can
// use them directly; the digest is what actually lands in the table.
const sha256 = (raw: string) => createHash('sha256').update(raw).digest('hex');
const RESET_TOKEN_INVITED = 'devreset-invited-farida-000000000000000000000000000000000000';
const RESET_TOKEN_RESET = 'devreset-mizan-reset-00000000000000000000000000000000000000000';
const SENSOR_KEY_B3 = 'devkey-rupganj-b3-sensor-0000000000000000000000000000';
const SENSOR_KEY_S1 = 'devkey-savar-s1-sensor-00000000000000000000000000000';
const FAR_FUTURE = '2027-12-31T00:00:00Z'; // reset-token expiry — always usable in dev

async function seed(): Promise<void> {
  await AppDataSource.initialize();
  const runner = AppDataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();

  const q = (sql: string, params?: unknown[]) => runner.query(sql, params);

  try {
    const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });
    // Invited/onboarding accounts get an unguessable, unusable hash — they can only get in by
    // running the password-reset flow (mirrors the real invite path in InviteMemberUseCase).
    const unusableHash = await argon2.hash(sha256('unusable-' + INVITED), { type: argon2.argon2id });

    const allUserIds = Array.from({ length: 11 }, (_, i) => U(i + 1));
    const seedAlertIds = [AL(1), AL(2), AL(3), AL(4), AL(5)];
    const allEmails = [
      'owner@fishfarm.test', 'partner@fishfarm.test', 'worker@fishfarm.test',
      'coowner@fishfarm.test', 'worker2@fishfarm.test', 'partner2@fishfarm.test',
      'invited@fishfarm.test', 'reset@fishfarm.test', 'deactivated@fishfarm.test',
      'removed@fishfarm.test', 'noproject@fishfarm.test',
    ];

    // ── 1. Clean up this seed's own footprint (order matters only where noted — no hard FKs) ──
    const projectOwned = [
      'financial_txn', 'task_log', 'task', 'inventory_txn', 'inventory_item', 'feeding_log',
      'harvest', 'sampling', 'mortality', 'water_reading', 'water_threshold', 'alert',
      'batch', 'stocking', 'pond', 'project_membership',
      'camera', 'weather_snapshot', 'treatment', 'pond_action', 'device', 'sync_mutation',
    ];
    // delivery_attempt is keyed by alert_id (not project_id) → clear it before its alerts vanish.
    await q(`DELETE FROM delivery_attempt WHERE alert_id = ANY($1)`, [seedAlertIds]);
    for (const table of projectOwned) {
      await q(`DELETE FROM ${table} WHERE project_id = ANY($1)`, [[RUPGANJ, SAVAR]]);
    }
    // User-scoped rows (not project-owned) — clear by user id before deleting the users themselves.
    await q(`DELETE FROM device_token WHERE user_id = ANY($1)`, [allUserIds]);
    await q(`DELETE FROM password_reset_token WHERE user_id = ANY($1)`, [allUserIds]);
    await q(`DELETE FROM refresh_token WHERE user_id = ANY($1)`, [allUserIds]);
    await q(`DELETE FROM project WHERE id = ANY($1)`, [[RUPGANJ, SAVAR]]);
    await q(`DELETE FROM species WHERE id = ANY($1)`, [[TILAPIA, PRAWN]]);
    await q(`DELETE FROM "user" WHERE email = ANY($1)`, [allEmails]);

    // ── 2. Users (every account-state the auth/onboarding flows need) ──────────────────────────
    const users: [string, string, string, string, string][] = [
      // id, email, name, password_hash, status
      [OWNER, 'owner@fishfarm.test', 'Karim Uddin', passwordHash, 'ACTIVE'],
      [PARTNER, 'partner@fishfarm.test', 'Anwar Hossain', passwordHash, 'ACTIVE'],
      [WORKER, 'worker@fishfarm.test', 'Rahim Mia', passwordHash, 'ACTIVE'],
      [COOWNER, 'coowner@fishfarm.test', 'Nasima Begum', passwordHash, 'ACTIVE'],
      [WORKER2, 'worker2@fishfarm.test', 'Jamal Sheikh', passwordHash, 'ACTIVE'],
      [PARTNER2, 'partner2@fishfarm.test', 'Selina Akter', passwordHash, 'ACTIVE'],
      // Freshly invited — unusable password, must onboard via RESET_TOKEN_INVITED.
      [INVITED, 'invited@fishfarm.test', 'Farida Yasmin', unusableHash, 'ACTIVE'],
      // Normal account carrying an active reset token (exercise reset-confirm directly).
      [RESET_USER, 'reset@fishfarm.test', 'Mizanur Rahman', passwordHash, 'ACTIVE'],
      // Deactivated — correct password, but login/reset are rejected (user not active).
      [DEACTIVATED, 'deactivated@fishfarm.test', 'Kamal Uddin', passwordHash, 'DEACTIVATED'],
      // Soft-removed member — still a user, but their Rupganj membership is REMOVED.
      [REMOVED_USER, 'removed@fishfarm.test', 'Sohel Rana', passwordHash, 'ACTIVE'],
      // No membership anywhere — the "no projects yet" empty state.
      [NOPROJECT, 'noproject@fishfarm.test', 'Taslima Khatun', passwordHash, 'ACTIVE'],
    ];
    for (const [id, email, name, hash, status] of users) {
      await q(
        `INSERT INTO "user" (id, email, name, password_hash, status) VALUES ($1,$2,$3,$4,$5)`,
        [id, email, name, hash, status],
      );
    }

    // ── 3. Projects (site coords: Rupganj & Savar, Bangladesh) ─────────────────────────────────
    await q(
      `INSERT INTO project (id, name, site_lat, site_lng, address, currency, land_unit, status)
       VALUES ($1,'Rupganj Tilapia Farm',23.8859,90.5236,'Rupganj, Narayanganj','BDT','BIGHA','ACTIVE')`,
      [RUPGANJ],
    );
    await q(
      `INSERT INTO project (id, name, site_lat, site_lng, address, currency, land_unit, status)
       VALUES ($1,'Savar Grow-out Unit',23.8583,90.2667,'Savar, Dhaka','BDT','BIGHA','ACTIVE')`,
      [SAVAR],
    );

    // ── 4. Memberships (covers multi-owner, single-worker-per-project, partner, soft-removal) ───
    const memberships: [string, string, string, string][] = [
      // project, user, role, status
      [RUPGANJ, OWNER, 'OWNER', 'ACTIVE'],
      [RUPGANJ, COOWNER, 'OWNER', 'ACTIVE'], // 2nd owner → removing either is fine; the last is 409-blocked
      [RUPGANJ, PARTNER, 'PARTNER', 'ACTIVE'],
      [RUPGANJ, WORKER, 'WORKER', 'ACTIVE'],
      [RUPGANJ, INVITED, 'PARTNER', 'ACTIVE'], // invited-but-not-onboarded
      [RUPGANJ, DEACTIVATED, 'PARTNER', 'ACTIVE'], // membership live, but the user is deactivated
      [RUPGANJ, REMOVED_USER, 'WORKER', 'REMOVED'], // soft-deleted history (R7) — no active-worker clash
      [SAVAR, OWNER, 'OWNER', 'ACTIVE'],
      [SAVAR, PARTNER2, 'PARTNER', 'ACTIVE'],
      [SAVAR, RESET_USER, 'PARTNER', 'ACTIVE'],
      [SAVAR, WORKER2, 'WORKER', 'ACTIVE'], // worker bound to a different project than WORKER
    ];
    for (const [pid, uid, role, status] of memberships) {
      await q(
        `INSERT INTO project_membership (project_id, user_id, role, status) VALUES ($1,$2,$3,$4)`,
        [pid, uid, role, status],
      );
    }

    // ── 5. Species reference ───────────────────────────────────────────────────────────────────
    await q(
      `INSERT INTO species (id, name, category, default_density_min, default_density_max)
       VALUES ($1,'Nile Tilapia','FISH',6,10),($2,'Golda Prawn','PRAWN',2,4)`,
      [TILAPIA, PRAWN],
    );

    // ── 6. Ponds (area in bighas — matches design anchors A2 1.5 / J1 2.0 / B3 1.2 / C1 1.0) ────
    const ponds: [string, string, string, number, number, string][] = [
      // id, project, name, area(bigha), depth_m, notes-target
      [PONDS.A2, RUPGANJ, 'A2', 1.5, 1.8, ''],
      [PONDS.J1, RUPGANJ, 'J1', 2.0, 2.0, ''],
      [PONDS.B3, RUPGANJ, 'B3', 1.2, 1.6, 'Aeration line installed'],
      [PONDS.C1, RUPGANJ, 'C1', 1.0, 1.5, ''],
      [PONDS.H1, RUPGANJ, 'H1', 1.6, 2.0, 'Harvest-ready'],
      [PONDS.S1, SAVAR, 'S1', 1.8, 1.7, ''],
    ];
    for (const [id, pid, name, area, depth, notes] of ponds) {
      await q(
        `INSERT INTO pond (id, project_id, name, area, depth_m, notes) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, pid, name, area, depth, notes || null],
      );
    }

    // ── 7. Stockings + Batches ─────────────────────────────────────────────────────────────────
    // Four grow-out batches on Rupganj: total stocked 42,000; cumulative mortality 3,360;
    // alive 38,640 (survival 92%) — the locked cross-screen anchors. Plus H1 (harvest-ready) and
    // Savar's single batch.
    const batches: {
      pond: string; project: string; species: string; count: number; stockedOn: string;
      cost: number; mort: number; harvested: number; avgWt: number; status: string; idx: number;
    }[] = [
      { pond: PONDS.A2, project: RUPGANJ, species: TILAPIA, count: 15000, stockedOn: '2026-04-22', cost: 22500, mort: 1200, harvested: 0, avgWt: 50, status: 'ACTIVE', idx: 1 },
      { pond: PONDS.J1, project: RUPGANJ, species: TILAPIA, count: 12000, stockedOn: '2026-04-22', cost: 18000, mort: 960, harvested: 0, avgWt: 48, status: 'ACTIVE', idx: 2 },
      { pond: PONDS.B3, project: RUPGANJ, species: PRAWN, count: 9000, stockedOn: '2026-04-25', cost: 27000, mort: 720, harvested: 0, avgWt: 46, status: 'ACTIVE', idx: 3 },
      { pond: PONDS.C1, project: RUPGANJ, species: TILAPIA, count: 6000, stockedOn: '2026-04-22', cost: 9000, mort: 480, harvested: 0, avgWt: 44, status: 'ACTIVE', idx: 4 },
      // Harvest-ready pond: stocked earlier, market-size fish, 2,000 already harvested.
      { pond: PONDS.H1, project: RUPGANJ, species: TILAPIA, count: 8000, stockedOn: '2026-02-01', cost: 12000, mort: 500, harvested: 2000, avgWt: 420, status: 'ACTIVE', idx: 5 },
      // Savar single grow-out batch.
      { pond: PONDS.S1, project: SAVAR, species: TILAPIA, count: 10000, stockedOn: '2026-06-01', cost: 15000, mort: 300, harvested: 0, avgWt: 22, status: 'ACTIVE', idx: 6 },
    ];
    for (const b of batches) {
      await q(
        `INSERT INTO stocking (id, project_id, pond_id, species_id, source, hatchery_name, count, stocked_on, stocking_cost_minor, currency)
         VALUES ($1,$2,$3,$4,'HATCHERY',$5,$6,$7,$8,'BDT')`,
        [ST(b.idx), b.project, b.pond, b.species, 'Brahmaputra Hatchery', b.count, b.stockedOn, taka(b.cost)],
      );
      await q(
        `INSERT INTO batch (id, project_id, pond_id, stocking_id, species_id, initial_count, cumulative_mortality, harvested_count, latest_avg_weight_g, status, stocked_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [BA(b.idx), b.project, b.pond, ST(b.idx), b.species, b.count, b.mort, b.harvested, b.avgWt, b.status, b.stockedOn],
      );
    }

    // ── 8. Water thresholds (project-level; DO safe 4–8, critical 3 per design) ─────────────────
    const thresholds: [string, string, number | null, number | null, number | null][] = [
      [RUPGANJ, 'DO', 4.0, 8.0, 3.0],
      [RUPGANJ, 'PH', 6.5, 9.0, null],
      [RUPGANJ, 'TEMP', 25.0, 33.0, null],
      [RUPGANJ, 'AMMONIA', null, 0.5, 1.0],
      [SAVAR, 'DO', 4.0, 8.0, 3.0],
      [SAVAR, 'PH', 6.5, 9.0, null],
    ];
    for (const [pid, param, min, max, crit] of thresholds) {
      await q(
        `INSERT INTO water_threshold (project_id, parameter, min, max, critical) VALUES ($1,$2,$3,$4,$5)`,
        [pid, param, min, max, crit],
      );
    }

    // ── 9. Water readings (MANUAL). B3 carries a critical DO (2.8 < 3.0) → drives the alert/badge.
    // A few days of A2 DO give the water-trends screen a line to draw.
    let wm = 0;
    const water: [string, string, string, number, string][] = [
      // pond, project, parameter, value, read_at
      [PONDS.A2, RUPGANJ, 'DO', 5.4, '2026-07-19T06:00:00Z'],
      [PONDS.A2, RUPGANJ, 'DO', 5.9, '2026-07-20T06:00:00Z'],
      [PONDS.A2, RUPGANJ, 'DO', 5.6, '2026-07-21T06:00:00Z'],
      [PONDS.A2, RUPGANJ, 'PH', 7.8, '2026-07-21T06:00:00Z'],
      [PONDS.A2, RUPGANJ, 'TEMP', 30.5, '2026-07-21T06:00:00Z'],
      [PONDS.J1, RUPGANJ, 'DO', 6.1, '2026-07-21T06:05:00Z'],
      [PONDS.J1, RUPGANJ, 'PH', 7.5, '2026-07-21T06:05:00Z'],
      [PONDS.J1, RUPGANJ, 'TEMP', 30.0, '2026-07-21T06:05:00Z'],
      [PONDS.B3, RUPGANJ, 'DO', 2.8, '2026-07-21T05:30:00Z'], // CRITICAL
      [PONDS.B3, RUPGANJ, 'PH', 8.9, '2026-07-21T05:30:00Z'],
      [PONDS.B3, RUPGANJ, 'TEMP', 31.2, '2026-07-21T05:30:00Z'],
      [PONDS.C1, RUPGANJ, 'DO', 5.0, '2026-07-21T06:10:00Z'],
      [PONDS.C1, RUPGANJ, 'PH', 7.2, '2026-07-21T06:10:00Z'],
      [PONDS.S1, SAVAR, 'DO', 5.8, '2026-07-21T06:00:00Z'],
      [PONDS.S1, SAVAR, 'PH', 7.4, '2026-07-21T06:00:00Z'],
    ];
    for (const [pond, pid, param, value, readAt] of water) {
      await q(
        `INSERT INTO water_reading (project_id, pond_id, parameter, value, source, read_at, client_mutation_id)
         VALUES ($1,$2,$3,$4,'MANUAL',$5,$6)`,
        [pid, pond, param, value, readAt, `seed-water-${++wm}`],
      );
    }

    // ── 10. Alerts (openCriticalAlerts = 1 → the B3 DO emergency) ───────────────────────────────
    const alerts: [number, string, string, string, string, string, string, string, string | null, string | null][] = [
      // idx, project, type, severity, state, message, source_ref, raised_at, acknowledged_at, resolved_at
      [1, RUPGANJ, 'WATER_EMERGENCY', 'CRITICAL', 'SENT', 'Dissolved oxygen critically low in Pond B3 (2.8 mg/L)', PONDS.B3, '2026-07-21T05:31:00Z', null, null],
      [2, RUPGANJ, 'LOW_STOCK', 'WARNING', 'RAISED', 'Floating feed 2mm below reorder level (120 kg)', INV(2), '2026-07-20T09:00:00Z', null, null],
      [3, RUPGANJ, 'MISSED_TASK', 'WARNING', 'RAISED', 'Task "Water test — all ponds" was missed', TK(3), '2026-07-21T00:05:00Z', null, null],
      [4, RUPGANJ, 'ABNORMAL_MORTALITY', 'INFO', 'ACKNOWLEDGED', 'Elevated mortality in Pond A2 over 48h', PONDS.A2, '2026-07-19T10:00:00Z', '2026-07-19T11:30:00Z', null],
      [5, RUPGANJ, 'WATER_THRESHOLD', 'WARNING', 'RESOLVED', 'pH high in Pond A2', PONDS.A2, '2026-07-15T06:00:00Z', '2026-07-15T07:00:00Z', '2026-07-16T06:00:00Z'],
    ];
    for (const [idx, pid, type, sev, state, msg, ref, raisedAt, ackAt, resAt] of alerts) {
      await q(
        `INSERT INTO alert (id, project_id, type, severity, state, message, source_ref, dedup_key, raised_at, acknowledged_at, resolved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [AL(idx), pid, type, sev, state, msg, ref, `seed-alert-${idx}`, raisedAt, ackAt, resAt],
      );
    }

    // ── 11. Inventory items + receipts ─────────────────────────────────────────────────────────
    const items: [string, string, string, string | null, string, number, number | null][] = [
      // id, project, name, feed_type, unit, quantity, low_stock_threshold
      [INV(1), RUPGANJ, 'Floating feed 3mm', 'FLOATING', 'kg', 850, 200],
      [INV(2), RUPGANJ, 'Floating feed 2mm', 'FLOATING', 'kg', 120, 200], // low → LOW_STOCK alert
      [INV(3), RUPGANJ, 'Agricultural lime', null, 'kg', 300, 50],
      [INV(4), RUPGANJ, 'Oxygen tablets', null, 'pcs', 40, 20],
      [INV(5), SAVAR, 'Floating feed 3mm', 'FLOATING', 'kg', 400, 100],
    ];
    for (const [id, pid, name, feedType, unit, qty, low] of items) {
      await q(
        `INSERT INTO inventory_item (id, project_id, name, feed_type, unit, quantity, low_stock_threshold)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, pid, name, feedType, unit, qty, low],
      );
    }
    const invTxns: [string, string, number, string, number | null, string][] = [
      // project, item, delta, reason, cost_minor, occurred_at
      [RUPGANJ, INV(1), 1000, 'RECEIPT', taka(45000), '2026-07-01T08:00:00Z'],
      [RUPGANJ, INV(1), -150, 'CONSUMPTION', null, '2026-07-20T07:00:00Z'],
      [RUPGANJ, INV(2), 500, 'RECEIPT', taka(24000), '2026-06-15T08:00:00Z'],
      [RUPGANJ, INV(3), 350, 'RECEIPT', taka(5250), '2026-07-05T08:00:00Z'],
    ];
    for (const [pid, item, delta, reason, cost, at] of invTxns) {
      await q(
        `INSERT INTO inventory_txn (project_id, item_id, delta, reason, cost_minor, occurred_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [pid, item, delta, reason, cost, at],
      );
    }

    // ── 12. Feeding logs ───────────────────────────────────────────────────────────────────────
    let fm = 0;
    const feeds: [string, string, string, number, string | null, string][] = [
      // project, batch, item, qty_kg, observation, fed_at
      [RUPGANJ, BA(1), INV(1), 45, 'Fish feeding actively', '2026-07-20T07:00:00Z'],
      [RUPGANJ, BA(2), INV(1), 38, null, '2026-07-20T07:15:00Z'],
      [RUPGANJ, BA(3), INV(2), 22, 'Slower response after water dip', '2026-07-19T07:30:00Z'],
      [RUPGANJ, BA(1), INV(1), 44, null, '2026-07-21T07:00:00Z'],
    ];
    for (const [pid, batch, item, qty, obs, at] of feeds) {
      await q(
        `INSERT INTO feeding_log (project_id, batch_id, inventory_item_id, qty_kg, observation, fed_at, client_mutation_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [pid, batch, item, qty, obs, at, `seed-feed-${++fm}`],
      );
    }

    // ── 13. Samplings (growth) ─────────────────────────────────────────────────────────────────
    let sm = 0;
    const samplings: [string, string, number, number, string][] = [
      // project, batch, sample_size, avg_weight_g, sampled_on
      [RUPGANJ, BA(1), 30, 42, '2026-07-04'],
      [RUPGANJ, BA(1), 30, 50, '2026-07-18'],
      [RUPGANJ, BA(2), 30, 48, '2026-07-18'],
      [RUPGANJ, BA(3), 25, 46, '2026-07-17'],
      [RUPGANJ, BA(4), 30, 44, '2026-07-18'],
      [RUPGANJ, BA(5), 20, 420, '2026-07-12'],
      [SAVAR, BA(6), 30, 22, '2026-07-19'],
    ];
    for (const [pid, batch, size, wt, on] of samplings) {
      await q(
        `INSERT INTO sampling (project_id, batch_id, sample_size, avg_weight_g, sampled_on, client_mutation_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [pid, batch, size, wt, on, `seed-sample-${++sm}`],
      );
    }

    // ── 14. Mortalities (recent events; cumulative already stored on the batch) ─────────────────
    let mm = 0;
    const morts: [string, string, number, string, string][] = [
      // project, batch, count, cause_category, occurred_at
      [RUPGANJ, BA(1), 80, 'DISEASE', '2026-07-16T08:00:00Z'],
      [RUPGANJ, BA(1), 45, 'WATER_QUALITY', '2026-07-19T08:00:00Z'],
      [RUPGANJ, BA(3), 120, 'PREDATION', '2026-07-15T08:00:00Z'],
      [RUPGANJ, BA(5), 30, 'UNKNOWN', '2026-07-10T08:00:00Z'],
    ];
    for (const [pid, batch, count, cause, at] of morts) {
      await q(
        `INSERT INTO mortality (project_id, batch_id, count, cause_category, occurred_at, client_mutation_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [pid, batch, count, cause, at, `seed-mort-${++mm}`],
      );
    }

    // ── 15. Harvest (H1 partial: 2,000 pieces @ ~420g = 840 kg, EXPORT grade) ───────────────────
    const harvestRevenue = taka(294000); // 2000 pcs → 840 kg @ ~350৳/kg
    await q(
      `INSERT INTO harvest (id, project_id, batch_id, quantity, total_weight_kg, grade, harvested_on, revenue_minor, client_mutation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [HV(1), RUPGANJ, BA(5), 2000, 840, 'EXPORT', '2026-07-15', harvestRevenue, 'seed-harvest-1'],
    );

    // ── 16. Tasks (+ one completed task's log) ──────────────────────────────────────────────────
    const tasks: [number, string, string | null, string, string, string, number | null][] = [
      // idx, project, pond, title, status, due_on, recurrence_days
      [1, RUPGANJ, PONDS.A2, 'Morning feed — Pond A2', 'DUE', '2026-07-21', 1],
      [2, RUPGANJ, PONDS.J1, 'Morning feed — Pond J1', 'DUE', '2026-07-21', 1],
      [3, RUPGANJ, null, 'Water test — all ponds', 'MISSED', '2026-07-20', null],
      [4, RUPGANJ, PONDS.B3, 'Net cleaning — Pond B3', 'SCHEDULED', '2026-07-23', 7],
      [5, RUPGANJ, PONDS.C1, 'Growth sampling — Pond C1', 'DONE', '2026-07-19', null],
      [6, RUPGANJ, PONDS.H1, 'Apply lime — Pond H1', 'DUE', '2026-07-22', null],
      [7, SAVAR, PONDS.S1, 'Morning feed — Pond S1', 'DUE', '2026-07-21', 1],
    ];
    for (const [idx, pid, pond, title, status, dueOn, rec] of tasks) {
      await q(
        `INSERT INTO task (id, project_id, pond_id, title, recurrence_days, status, due_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [TK(idx), pid, pond, title, rec, status, dueOn],
      );
    }
    await q(
      `INSERT INTO task_log (project_id, task_id, completed_at, client_mutation_id)
       VALUES ($1,$2,$3,$4)`,
      [RUPGANJ, TK(5), '2026-07-19T09:30:00Z', 'seed-tasklog-1'],
    );

    // ── 17. Finance (Rupganj: costs + the H1 harvest revenue; Savar: two costs) ─────────────────
    const finance: [string, string, string, number, string, string | null][] = [
      // project, kind, category, amount(taka), occurred_on, source_ref
      [RUPGANJ, 'COST', 'STOCKING', 66000, '2026-04-22', null],
      [RUPGANJ, 'COST', 'EQUIPMENT', 15000, '2026-05-05', null],
      [RUPGANJ, 'COST', 'FEED', 40000, '2026-05-10', null],
      [RUPGANJ, 'COST', 'SALARY', 25000, '2026-06-01', null],
      [RUPGANJ, 'COST', 'FEED', 55000, '2026-06-12', null],
      [RUPGANJ, 'COST', 'MEDICINE', 8000, '2026-06-20', null],
      [RUPGANJ, 'COST', 'SALARY', 25000, '2026-07-01', null],
      [RUPGANJ, 'COST', 'FEED', 48000, '2026-07-08', null],
      [RUPGANJ, 'REVENUE', 'HARVEST', 294000, '2026-07-15', HV(1)],
      [SAVAR, 'COST', 'STOCKING', 15000, '2026-06-01', null],
      [SAVAR, 'COST', 'FEED', 18000, '2026-07-05', null],
    ];
    for (const [pid, kind, cat, amt, on, ref] of finance) {
      await q(
        `INSERT INTO financial_txn (project_id, kind, category, amount_minor, occurred_on, source_ref)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [pid, kind, cat, taka(amt), on, ref],
      );
    }

    // ── 18. Cameras (monitoring web TASK-039 + mobile camera TASK-045) ──────────────────────────
    const cameras: [string, string, string, string, string, boolean][] = [
      // id, project, rtsp_url, stream_url, protocol, online
      [CAM(1), RUPGANJ, 'rtsp://10.0.0.11:554/stream1', 'https://demo.fishfarm.test/hls/rupganj-a2/index.m3u8', 'HLS', true],
      [CAM(2), RUPGANJ, 'rtsp://10.0.0.12:554/stream1', 'https://demo.fishfarm.test/hls/rupganj-b3/index.m3u8', 'HLS', false], // offline → degraded state
      [CAM(3), SAVAR, 'rtsp://10.0.1.11:554/stream1', 'https://demo.fishfarm.test/webrtc/savar-s1', 'WEBRTC', true],
    ];
    for (const [id, pid, rtsp, stream, protocol, online] of cameras) {
      await q(
        `INSERT INTO camera (id, project_id, rtsp_url, stream_url, protocol, online) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, pid, rtsp, stream, protocol, online],
      );
    }

    // ── 19. Weather snapshots (one cache row per project; makes the widget show data even without
    // OPENWEATHER_API_KEY). Rupganj → extreme-heat badge; Savar → heavy-rain badge. ───────────────
    const weather: [string, string, number, string, boolean, boolean, string][] = [
      // id, project, temp_c, condition, heavy_rain, extreme_heat, fetched_at
      [WS(1), RUPGANJ, 37.4, 'Clear', false, true, '2026-07-25T06:00:00Z'],
      [WS(2), SAVAR, 28.9, 'Rain', true, false, '2026-07-25T06:00:00Z'],
    ];
    for (const [id, pid, temp, cond, rain, heat, at] of weather) {
      await q(
        `INSERT INTO weather_snapshot (id, project_id, temp_c, condition, heavy_rain, extreme_heat, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, pid, temp, cond, rain, heat, at],
      );
    }

    // ── 20. Treatments (health module; one inside its withdrawal window → harvest-block warning) ─
    const treatments: [string, string, string, string, string, string, number][] = [
      // id, project, batch, product, dose, administered_on, withdrawal_days
      [TR(1), RUPGANJ, BA(3), 'Oxytetracycline', '5 g / kg feed, 7 days', '2026-07-18', 21], // still in withdrawal
      [TR(2), RUPGANJ, BA(1), 'Salt bath (NaCl)', '3% dip, 10 min', '2026-06-10', 0],
    ];
    for (const [id, pid, batch, product, dose, on, withdrawalDays] of treatments) {
      await q(
        `INSERT INTO treatment (id, project_id, batch_id, product, dose, administered_on, withdrawal_days)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, pid, batch, product, dose, on, withdrawalDays],
      );
    }

    // ── 21. Device (push) tokens — FCM registrations per user (notifications flow) ───────────────
    const deviceTokens: [string, string, string, string][] = [
      // id, user, fcm_token, platform
      [DTK(1), WORKER, 'fcm-demo-worker-rupganj-android', 'ANDROID'],
      [DTK(2), WORKER2, 'fcm-demo-worker2-savar-android', 'ANDROID'],
      [DTK(3), OWNER, 'fcm-demo-owner-web', 'WEB'],
    ];
    for (const [id, uid, token, platform] of deviceTokens) {
      await q(
        `INSERT INTO device_token (id, user_id, fcm_token, platform) VALUES ($1,$2,$3,$4)`,
        [id, uid, token, platform],
      );
    }

    // ── 22. Delivery attempts for the open CRITICAL B3 alert (multi-channel fan-out + 1 failure) ─
    const deliveries: [string, string, string, string, string, string | null][] = [
      // id, alert, channel, status, attempted_at, error
      [DA(1), AL(1), 'FCM', 'SENT', '2026-07-21T05:31:05Z', null],
      [DA(2), AL(1), 'SMS', 'SENT', '2026-07-21T05:31:07Z', null],
      [DA(3), AL(1), 'FCM', 'FAILED', '2026-07-21T05:31:05Z', 'UNREGISTERED token for owner web session'],
    ];
    for (const [id, alertId, channel, status, at, error] of deliveries) {
      await q(
        `INSERT INTO delivery_attempt (id, alert_id, channel, status, attempted_at, error)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, alertId, channel, status, at, error],
      );
    }

    // ── 23. Pond actions (water intervention log; CHAIN_DRAG / AERATION) ─────────────────────────
    const pondActions: [string, string, string, string, string, string | null][] = [
      // id, project, pond, action_type, performed_at, notes
      [PA(1), RUPGANJ, PONDS.B3, 'AERATION', '2026-07-21T05:45:00Z', 'Emergency aeration after DO crash'],
      [PA(2), RUPGANJ, PONDS.A2, 'CHAIN_DRAG', '2026-07-20T16:00:00Z', 'Routine bottom disturbance'],
      [PA(3), SAVAR, PONDS.S1, 'AERATION', '2026-07-19T18:00:00Z', null],
    ];
    let pam = 0;
    for (const [id, pid, pond, type, at, notes] of pondActions) {
      await q(
        `INSERT INTO pond_action (id, project_id, pond_id, action_type, performed_at, notes, client_mutation_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, pid, pond, type, at, notes, `seed-pondaction-${++pam}`],
      );
    }

    // ── 24. Sensor devices (device-key ingestion; key stored only as SHA-256 digest) ────────────
    const devices: [string, string, string, string, string][] = [
      // id, project, pond, device_key_hash, label
      [DEV(1), RUPGANJ, PONDS.B3, sha256(SENSOR_KEY_B3), 'B3 DO/temp probe'],
      [DEV(2), SAVAR, PONDS.S1, sha256(SENSOR_KEY_S1), 'S1 multiparameter probe'],
    ];
    for (const [id, pid, pond, keyHash, label] of devices) {
      await q(
        `INSERT INTO device (id, project_id, pond_id, device_key_hash, label) VALUES ($1,$2,$3,$4,$5)`,
        [id, pid, pond, keyHash, label],
      );
    }

    // ── 25. Sync mutations (mobile offline replay/dedup; SYNCED terminal + one CONFLICT) ─────────
    const syncMutations: [string, string, string, string, string][] = [
      // client_mutation_id, project, user, entity, status
      ['seed-sync-feed-1', RUPGANJ, WORKER, 'FEEDING_LOG', 'SYNCED'],
      ['seed-sync-mort-1', RUPGANJ, WORKER, 'MORTALITY', 'SYNCED'],
      ['seed-sync-task-1', RUPGANJ, WORKER, 'TASK_LOG', 'SYNCED'],
      ['seed-sync-water-1', RUPGANJ, WORKER, 'WATER_READING', 'CONFLICT'], // replayed late → server won
      ['seed-sync-feed-2', SAVAR, WORKER2, 'FEEDING_LOG', 'SYNCED'],
    ];
    for (const [cmid, pid, uid, entity, status] of syncMutations) {
      await q(
        `INSERT INTO sync_mutation (client_mutation_id, project_id, user_id, entity, status, processed_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [cmid, pid, uid, entity, status, '2026-07-21T02:00:00Z'],
      );
    }

    // ── 26. Password reset tokens (onboarding + reset; one expired for the rejection path) ───────
    const resetTokens: [string, string, string, string, string | null][] = [
      // id, user, token_hash, expires_at, used_at
      [PRT(1), INVITED, sha256(RESET_TOKEN_INVITED), FAR_FUTURE, null], // onboards invited@
      [PRT(2), RESET_USER, sha256(RESET_TOKEN_RESET), FAR_FUTURE, null], // resets reset@
      [PRT(3), OWNER, sha256('devreset-expired-owner'), '2025-01-01T00:00:00Z', null], // expired → rejected
    ];
    for (const [id, uid, hash, expiresAt, usedAt] of resetTokens) {
      await q(
        `INSERT INTO password_reset_token (id, user_id, token_hash, expires_at, used_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, uid, hash, expiresAt, usedAt],
      );
    }

    await runner.commitTransaction();

    // ── Summary ────────────────────────────────────────────────────────────────────────────────
    console.log('\n✅ Seed complete — full web + mobile flow coverage.\n');
    console.log('LOGIN (dev password for every usable account):  ' + DEV_PASSWORD);
    console.log('  owner@fishfarm.test        OWNER   Rupganj + Savar   (full admin, finance)');
    console.log('  coowner@fishfarm.test      OWNER   Rupganj           (2nd owner → last-owner-409)');
    console.log('  partner@fishfarm.test      PARTNER Rupganj           (read-only, no finance/admin)');
    console.log('  partner2@fishfarm.test     PARTNER Savar');
    console.log('  worker@fishfarm.test       WORKER  Rupganj           (mobile primary)');
    console.log('  worker2@fishfarm.test      WORKER  Savar             (single-project binding)');
    console.log('  reset@fishfarm.test        PARTNER Savar             (has active reset token)');
    console.log('  deactivated@fishfarm.test  DEACTIVATED               (login is rejected)');
    console.log('  removed@fishfarm.test      ex-WORKER Rupganj REMOVED (soft-delete history)');
    console.log('  noproject@fishfarm.test    (no membership)           (empty-state / create project)');
    console.log('  invited@fishfarm.test      PARTNER Rupganj           (NO password — onboard via reset)\n');
    console.log('PASSWORD RESET  →  POST /auth/password-reset/confirm { token, newPassword }');
    console.log('  onboard invited@ :  ' + RESET_TOKEN_INVITED);
    console.log('  reset   reset@   :  ' + RESET_TOKEN_RESET);
    console.log('SENSOR INGEST   →  POST /devices/{deviceId}/readings   header  X-Device-Key: <key>');
    console.log('  Rupganj B3 (' + DEV(1) + ') :  ' + SENSOR_KEY_B3);
    console.log('  Savar   S1 (' + DEV(2) + ') :  ' + SENSOR_KEY_S1 + '\n');
    console.log('Projects:  Rupganj Tilapia Farm (full data) · Savar Grow-out Unit (light)');
    console.log('Rupganj anchors:  42,000 stocked · 3,360 mortality · 38,640 alive (92% survival)');
    console.log('                  1 open CRITICAL alert (B3 DO 2.8) · net = revenue − cost');
    console.log('Also seeded:  cameras · weather cache · treatments · push tokens · alert deliveries');
    console.log('              pond actions · sensor devices · offline sync mutations\n');
  } catch (err) {
    await runner.rollbackTransaction();
    throw err;
  } finally {
    await runner.release();
    await AppDataSource.destroy();
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Seed failed:', err);
    process.exit(1);
  });
