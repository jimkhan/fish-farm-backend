# Performance & load-test harness (TASK-050, MOD-01, NFR-004, AC-142)

Verifies the two NFR-004 thresholds against the real app on a throwaway Postgres:

1. **p95 API latency < 300 ms** driving **100 concurrent** read + write requests;
2. a **≤ 200-record** offline batch to **`POST /sync`** completes in **< 5 s**.

Both measured paths go through the `ProjectScopeGuard` (a `:projectId`-scoped read, a scoped
write, and the per-mutation membership resolution inside the sync dispatcher), so scope-guard
overhead is included exactly as the task's technical note requires.

## Run it

```sh
npm run perf
```

This boots the real application against a disposable `postgres:15-alpine` (the same
`testcontainers` infra the e2e suite uses — **Docker must be running**), seeds a project/pond and
"expected v1 volumes" of readings, then runs the two measurements and prints a summary line per
test, e.g.:

```
[perf] latency over 1000 req @ concurrency 100 (70% read): p50=110.8ms p95=134.2ms p99=140.9ms max=161.5ms errors=0
[perf] /sync batch of 200: 1189ms, 200/200 SYNCED
```

The harness **asserts** both thresholds (the run fails if either is breached), so it is usable as a
gate. It lives in `perf/*.perf-spec.ts` with its own Jest config (`jest.perf.config.js`) so the
normal `npm test` suite never runs it.

## Why a hand-rolled undici harness (not k6/artillery)

BACKLOG names "k6/artillery", but that's a suggestion, not a mandate — and a deliberate,
documented choice was made to use neither:

- **k6** is a Go binary, not npm-installable, and is not present in this environment; committed k6
  scripts couldn't actually be *run* here to produce the real numbers the DoD (and the TASK-048/049
  "rehearse it, don't just assert" precedent) call for.
- **artillery / autocannon** would each be a new dependency for something the existing infra
  already covers.
- **`undici`** is already available (zero new dependency), and the whole repo is testcontainers-
  based — the technical note literally says "runs against a test container." A hand-rolled undici
  harness satisfies every constraint with no new dependency and no external binary, and it runs
  here to report real p95 numbers.

If a real CI system is later stood up (there is none in this repo today — the "wired into CI as a
non-blocking perf gate" line is aspirational), this is the script to invoke as a non-blocking step
(`continue-on-error`), or to swap for a k6 job once the k6 binary is available on the runner.

## Tunables

The load shape (in `load-harness.perf-spec.ts`) fixes only what the spec fixes — 100 concurrency,
a ≤200 sync batch — and documents the rest as judgment calls: 1000 sampled requests, a 70/30
read/write mix, an 800-reading seed, a discarded warmup round.

## A note on the read endpoint

The representative read is `GET /projects/{id}` (a single scoped row). The **unbounded**
`GET /projects/{id}/ponds/{pondId}/water-readings` list is deliberately *not* the measured read:
it has no pagination, so it returns the entire table and becomes a latency outlier at volume
(measured p95 ≈ 1.1 s at an 800-row seed). That's a real, noted observation — a candidate for a
future pagination pass — but out of scope for this measurement spike.

## Non-goals (per BACKLOG)

No production APM/observability stack; no soak testing.
