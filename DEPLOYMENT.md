# Deployment (TASK-048, MOD-01, AC-140, NFR-005/007/010)

The whole portfolio runs on **one modest VPS** (NFR-010) via Docker Compose — no Kubernetes,
no per-tenant infrastructure. Four services: `api` (this repo), `postgres`, `media-server`
(MediaMTX, per-site camera transcoding, isolated from the app tier per ADR-012), and `caddy`
(TLS termination + reverse proxy, automatic Let's Encrypt).

## Prerequisites

- A host with Docker + Docker Compose v2 installed.
- **Production only:** a public domain pointed at the host's IP (A/AAAA record), with inbound
  `:80`/`:443` reachable — Caddy needs both for ACME HTTP-01 issuance and HTTPS itself.
- Copy `.env.example` to `.env` and fill in every required value (see `env.validation.ts` for
  what's required vs. optional — the app fails fast at boot listing any missing required key).

## Production

```sh
cp .env.example .env
# edit .env: JWT_ACCESS_SECRET (openssl rand -hex 32), DB_*, DOMAIN, ACME_EMAIL, ...
docker compose up -d
```

`api`'s entrypoint (`docker/entrypoint.sh`) waits for `postgres`, runs `npm run migration:run`
(never `synchronize`, per CLAUDE.md invariant #4), then starts the app. Caddy automatically
issues and renews a real TLS certificate for `$DOMAIN` — no separate certbot step.

**Verify:**

```sh
curl https://$DOMAIN/health
# {"status":"ok","version":"0.1.0","checks":{"db":"ok"}}
```

## Local / no-domain testing

No public domain or open `:80` needed — Caddy issues a self-signed cert via its built-in
internal CA (`tls internal`) instead of attempting real ACME:

```sh
cp .env.example .env
# edit .env: set DOMAIN=localhost (required — see docker-compose.local.yml's own comment for why)
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
curl -k https://localhost:8443/health
```

## Camera / weather provisioning

- `OPENWEATHER_API_KEY` and `MEDIA_SERVER_BASE_URL` are provisioned here (env schema + compose
  wiring) ahead of the application code that will consume them (TASK-035/036, MOD-10 — not yet
  built). Both are optional today; the app boots fine without them.
- Per-site RTSP camera sources are **not** environment variables — they're stored server-side in
  the project-owned `camera` table (raw RTSP creds never leave the backend, per MOD-10's own
  design) and registered with MediaMTX dynamically via its HTTP API (`media-server:9997`) once
  TASK-035 lands. `deploy/mediamtx.yml` intentionally has no hardcoded camera paths.

## Logging & request tracing (NFR-005)

Every HTTP request — including ones rejected before a controller runs (401 from
`AuthMiddleware`, 403 from `ProjectScopeGuard`, 400 from `ValidationPipe`, 404 for unknown
routes) — produces exactly one `http.request` log line when the response finishes:

```json
{"ts":"2026-09-14T10:12:03.412Z","level":"warn","context":"Http","msg":"POST /projects/:projectId/ponds 400 8.3ms",
 "event":"http.request","method":"POST","path":"/projects/6b1…/ponds","route":"/projects/:projectId/ponds",
 "status":400,"durationMs":8.3,"correlationId":"6c2e…","userId":"aaaa…","projectId":"6b1…","role":"OWNER",
 "handler":"PondsController.createHandler","ip":"203.0.113.9","userAgent":"okhttp/4.12","responseBytes":142,
 "errorCode":"VALIDATION","errorMessage":"Validation failed.","errorDetails":{"errors":["name should not be empty"]}}
```

Severity is `info` for 2xx/3xx, `warn` for 4xx, `error` for 5xx (5xx additionally log the stack
under `DomainExceptionFilter`). `correlationId` is the same value the client receives in the
`x-correlation-id` response header and in the `Error` body, so a screenshot from the mobile app
can be matched to the exact server line. Passwords, tokens, API keys and similar fields are
redacted by key name wherever they appear.

| Variable        | Values                                        | Default                                   |
| --------------- | --------------------------------------------- | ----------------------------------------- |
| `LOG_LEVEL`     | `fatal` `error` `warn` `log` `debug` `verbose` | `debug` in development, `log` otherwise   |
| `LOG_FORMAT`    | `json` `pretty`                               | `pretty` in development, `json` otherwise |
| `LOG_HTTP_BODY` | `true` `false`                                | `false` — adds the redacted request body  |

In compose, `docker compose logs -f api` shows the JSON lines; pipe through `jq` to filter, e.g.
`docker compose logs --no-log-prefix api | jq -c 'select(.status>=400)'`.

## Graceful degradation (NFR-007)

The weather API or a site camera being down must degrade the owner dashboard (feature disabled),
never crash it. The infra half (this task) provisions the media server + weather key; the
application-level degradation behavior (cache/circuit-breaker for weather, offline state for
camera) is TASK-036/TASK-035's own deliverable and is unit-tested there, not here.

## Backups & restore (TASK-049, MOD-01, AC-141, NFR-008)

The `backup` service (`deploy/backup/`) is its own deployable unit, isolated from the app tier —
same philosophy as `media-server` (ADR-012). It runs `crond` in the foreground and, on schedule
(default `0 2 * * *` UTC — a documented judgment call, BACKLOG names no specific time), does one
cycle of: `pg_dump -Fc` (full schema + data, restorable onto a genuinely empty database) → upload
to an S3-compatible bucket via `rclone` → prune off-host dumps older than the retention window
(default **14 days** — also a documented judgment call, chosen to comfortably exceed NFR-008's
24h RPO while bounding storage cost; BACKLOG specifies no number).

**"Off-host copy" mechanism (escalated, human-confirmed)** — BACKLOG.md's own text says "an
off-host copy" with zero concrete guidance anywhere else in the spec corpus (no ADR, no named
provider). Escalated before implementing, matching TASK-048's own precedent for unnamed-mechanism
choices: human chose **S3-compatible object storage** over standing up and operating a second
remote host — no second server to provision/patch/pay for, and it fits the spec's explicit
"single-VPS deployment" framing (TECHNICAL_SPECIFICATION §18). Any S3-compatible provider works
through the same `rclone` config (AWS S3, DigitalOcean Spaces, Backblaze B2, self-hosted MinIO —
provider-specific behavior is `BACKUP_S3_PROVIDER`/`BACKUP_S3_ENDPOINT`, not code).

**No plaintext secrets in backups** (BACKLOG's own constraint) — verified, not assumed: the
database itself never stores a plaintext secret to begin with (`password_hash` is argon2,
`refresh_token.token_hash` is hashed, per TASK-008/009's own design), so the dump content is safe
by construction. The backup *pipeline* also never bakes S3/DB credentials into the image or logs
them — `entrypoint.sh` writes them to `rclone.conf`/`/etc/backup.env` at container start from env
vars only (`chmod 600`), matching CLAUDE.md invariant #5.

**Required env vars (production)** — `BACKUP_S3_REMOTE`/`BACKUP_S3_ACCESS_KEY_ID`/
`BACKUP_S3_SECRET_ACCESS_KEY`; the `backup` container's own entrypoint fails fast at start if any
is unset (not a compose-level `${VAR:?...}` like `DOMAIN`, since docker-compose.local.yml's MinIO
override needs to replace these without production's requirement rejecting the override during
compose's per-file interpolation — see the comment in docker-compose.yml). See `.env.example` for
the full list including optional endpoint/provider/region/retention/schedule overrides.

**Manual trigger / inspect / restore:**

```sh
# Run a backup cycle right now (outside the schedule)
docker compose exec backup backup.sh

# List available off-host dumps
docker compose exec backup rclone lsf "$BACKUP_S3_REMOTE"

# Restore a named dump onto the current database (drops+recreates existing objects first,
# so this is also how you'd recover after data corruption, not just a full host loss)
docker compose exec backup restore.sh fms-backup-20260720T020000Z.dump
```

`restore.sh` finishes with a real verification query (`SELECT count(*) FROM migrations`, failing
loudly if empty) — proving the restored database is actually operational, not just that
`pg_restore` exited 0. This is AC-141's second clause.

**Live-rehearsed, not just asserted** (Chore-type DoD precedent set by TASK-048's own tracker
entry — no Jest suite for infra artifacts, compose-config validation + a live rehearsal instead):
`docker compose -f docker-compose.yml -f docker-compose.local.yml up` additionally brings up a
`minio`+`minio-init` pair that stands in for a real bucket (no public cloud account is reachable
from this sandboxed dev environment, same constraint TASK-048 hit for real ACME) — the full
dump → off-host upload → restore → verification-query cycle was run for real against it. Pointing
`BACKUP_S3_*` at a real provider in production exercises the identical code path.

Non-goals (per BACKLOG): no PITR/WAL streaming in v1; no cross-region DR.

## What's out of scope here (documented, not silently skipped)

- **Kubernetes / per-tenant infra** — explicit non-goal (NFR-010).
- **Camera recording** — live-only in MVP (ADR-012), P3.
- **A real, DNS-resolvable production domain** — this repo's compose files are ready for one
  (`DOMAIN`/`ACME_EMAIL` in `.env`), but issuing a real Let's Encrypt cert wasn't (and can't be)
  exercised from a sandboxed dev environment with no public DNS or inbound `:80`/`:443`. The
  local self-signed path above is what was actually run end-to-end to prove the topology works.
