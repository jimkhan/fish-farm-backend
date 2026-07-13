# @fish-farm/shared

Cross-surface contracts for the Fish Farm Management System: domain-event types (ADR-015) and,
as modules land, shared DTO/enum types. Hosted in `fish-farm-backend/packages/shared` and
published to the web and mobile repos (ADR-002, OI-1) so all three surfaces compile against
identical types.

- Backend consumes it as an npm-workspace dependency (`@fish-farm/shared` in the root
  `package.json`); `npm install` at the repo root builds it via the `prepare` hook.
- Web/mobile consume the **published build** (private registry or packed tarball via
  `npm run packages:pack` at the backend root) — never path imports across repos.
- Build: `npm run build` (emits `dist/` with `.d.ts` declarations). Framework-free — no NestJS,
  no TypeORM, no HTTP (CLAUDE.md invariant #2 applies to everything in here).
