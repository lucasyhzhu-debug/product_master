---
phase: 83-bigseller-pagelist-refresh
plan: 05
type: execute
wave: 2
depends_on: ["83-04-n1-elimination"]
files_modified:
  - convex/integrations/bigseller/config.ts
  - convex/integrations/bigseller/sync.ts
  - convex/integrations/bigseller/__tests__/cron.test.ts
  - docs/CHANGELOG.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "pollSyncTask reschedules with an adaptive delay: 15s for the first 3 polls, 30s for the next 2, 60s thereafter (D-05 O3)"
    - "The max poll count stays 8 (BIGSELLER_MAX_POLLS unchanged) so the worst-case bound is unchanged"
    - "All 4 runAfter reschedule sites in sync.ts use pollDelayMs(pollAttempt) instead of the flat BIGSELLER_POLL_INTERVAL_MS"
  artifacts:
    - path: "convex/integrations/bigseller/config.ts"
      provides: "pollDelayMs ramp helper"
      contains: "pollDelayMs"
    - path: "convex/integrations/bigseller/__tests__/cron.test.ts"
      provides: "pollDelayMs ramp unit test"
      contains: "pollDelayMs"
  key_links:
    - from: "convex/integrations/bigseller/sync.ts"
      to: "pollDelayMs"
      via: "ctx.scheduler.runAfter delay argument"
      pattern: "pollDelayMs\\("
---

<objective>
O3 — adaptive polling (D-05, low-risk-first #2). Today `pollSyncTask` reschedules with a flat 60s × up to 8 attempts. BigSeller's `taskStatus` typically flips to `complete` within 30-90s for small windows, so the flat 60s wastes minutes on short-window syncs.

Add a `pollDelayMs(pollAttempt)` ramp — 15s × 3, 30s × 2, 60s thereafter — and replace all 4 `runAfter(BIGSELLER_POLL_INTERVAL_MS, ...)` sites with `runAfter(pollDelayMs(args.pollAttempt), ...)`. Keep `BIGSELLER_MAX_POLLS = 8` so the worst-case bound is unchanged.

Purpose: cut ~3-5 min off the typical sync wait. Single-file change, no new failure modes.
Output: ramp helper, 4 reschedule swaps, a NEW pollDelayMs unit test (Flag #3 — there is no literal 60s assertion to edit), CHANGELOG.
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/execute-plan.md
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/83-bigseller-pagelist-refresh/83-CONTEXT.md
@.planning/phases/83-bigseller-pagelist-refresh/83-PATTERNS.md
@.planning/phases/83-bigseller-pagelist-refresh/83-02-sync-optimization-SPEC.md

<interfaces>
<!-- config.ts:17 BIGSELLER_MAX_POLLS = 8 (KEEP); config.ts:20 BIGSELLER_POLL_INTERVAL_MS = 60000 (keep export, stop using in reschedules) -->
<!-- 4 reschedule sites in sync.ts, all `runAfter(BIGSELLER_POLL_INTERVAL_MS, internal...sync.pollSyncTask, {...})`:
       L322-324 (first poll, after triggerSync)
       L375-379 (network-error retry in pollSyncTask)
       L415-419 (invalid-JSON retry in pollSyncTask)
       L558    (not-complete branch — poll again) -->
<!-- cron.test.ts uses convexTest(schema); references pollAttempt at L27/57/102. No literal 60000 assertion exists (Flag #3). -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add pollDelayMs ramp helper to config.ts</name>
  <read_first>
    - convex/integrations/bigseller/config.ts (L16-20 BIGSELLER_MAX_POLLS + BIGSELLER_POLL_INTERVAL_MS)
    - 83-02-sync-optimization-SPEC.md O3 (15s×3 / 30s×2 / 60s; max attempts unchanged)
    - 83-PATTERNS.md pollDelayMs section + Flag #3
  </read_first>
  <behavior>
    - pollDelayMs(0) === 15000, pollDelayMs(1) === 15000, pollDelayMs(2) === 15000
    - pollDelayMs(3) === 30000, pollDelayMs(4) === 30000
    - pollDelayMs(5) === 60000, pollDelayMs(6) === 60000, pollDelayMs(7) === 60000
  </behavior>
  <action>
Add to `convex/integrations/bigseller/config.ts` (below `BIGSELLER_POLL_INTERVAL_MS`):
```typescript
/**
 * Adaptive poll delay (Phase 83-05 / O3): 15s for the first 3 polls, 30s for the
 * next 2, 60s thereafter. BIGSELLER_MAX_POLLS stays 8 so the worst-case bound is
 * unchanged. BigSeller's taskStatus typically flips to `complete` within 30-90s
 * for small windows — the flat 60s wasted minutes on short syncs.
 */
export function pollDelayMs(pollAttempt: number): number {
  if (pollAttempt < 3) return 15000;
  if (pollAttempt < 5) return 30000;
  return 60000;
}
```
Keep `BIGSELLER_MAX_POLLS = 8` and the `BIGSELLER_POLL_INTERVAL_MS = 60000` export (other code/tests may import it; just stop using it in the reschedules).
  </action>
  <verify>
    <automated>npm run type-check</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function pollDelayMs' convex/integrations/bigseller/config.ts` returns 1
    - `grep -c 'BIGSELLER_MAX_POLLS = 8' convex/integrations/bigseller/config.ts` returns 1
    - `npm run type-check` exits 0
  </acceptance_criteria>
  <done>pollDelayMs exported with the 15/30/60 ramp; max-polls unchanged; type-check green.</done>
</task>

<task type="auto">
  <name>Task 2: Swap all 4 runAfter reschedule sites to pollDelayMs</name>
  <read_first>
    - convex/integrations/bigseller/sync.ts (L19 BIGSELLER_POLL_INTERVAL_MS import; reschedule sites at L322-324, L375-379, L415-419, L558)
    - 83-PATTERNS.md "Replace all three runAfter" (it's actually 4 sites — L322 first-poll + 3 in pollSyncTask)
  </read_first>
  <action>
In `convex/integrations/bigseller/sync.ts`, replace the delay argument at ALL FOUR `ctx.scheduler.runAfter(BIGSELLER_POLL_INTERVAL_MS, ...)` sites with `pollDelayMs(...)`:

1. L322-324 (first poll scheduled from `triggerSync`, before `pollSyncTask` has run): `pollAttempt` is 0 here, so use `ctx.scheduler.runAfter(pollDelayMs(0), ...)`.
2. L375-379 (network-error retry): `ctx.scheduler.runAfter(pollDelayMs(args.pollAttempt), ...)`.
3. L415-419 (invalid-JSON retry): `ctx.scheduler.runAfter(pollDelayMs(args.pollAttempt), ...)`.
4. L558 (not-complete branch — poll again): `ctx.scheduler.runAfter(pollDelayMs(args.pollAttempt), ...)`.

Import `pollDelayMs` from `./config` (alongside the existing `BIGSELLER_POLL_INTERVAL_MS` / `BIGSELLER_MAX_POLLS` import at L19). The `{ ...args, pollAttempt: args.pollAttempt + 1 }` payload stays exactly as-is — the delay is computed from the CURRENT attempt, the NEXT attempt is the rescheduled one.
  </action>
  <verify>
    <automated>npm run test -- bigseller</automated>
  </verify>
  <acceptance_criteria>
    <!-- staffreview I2: the runAfter calls are MULTI-LINE (delay arg on its own line, e.g. sync.ts:322-324), so a single-line `grep 'runAfter(\s*pollDelayMs'` returns 0 even after a correct edit, and `grep 'runAfter(\s*BIGSELLER_POLL_INTERVAL_MS'` is a FALSE-PASS (already 0 before any change). Use line-count of the call expression instead. -->
    - `grep -c 'pollDelayMs(' convex/integrations/bigseller/sync.ts` returns >= 5 (1 import + 4 reschedule-site delay args: pollDelayMs(0) at the first poll, pollDelayMs(args.pollAttempt) at the 3 pollSyncTask sites)
    - the delay argument on the line directly under each of the 4 `ctx.scheduler.runAfter(` poll-reschedule sites (≈L322-324, L375-379, L415-419, L558) is `pollDelayMs(...)`, NOT `BIGSELLER_POLL_INTERVAL_MS` — verify by reading those 4 sites (BIGSELLER_POLL_INTERVAL_MS legitimately remains on its import line and as an unused export, so a bare grep count is not a clean signal)
    - `npm run test -- bigseller` exits 0
  </acceptance_criteria>
  <done>All 4 reschedules use pollDelayMs(currentAttempt); no remaining flat-interval reschedule; bigseller suite green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: pollDelayMs ramp + max-attempts test in cron.test.ts; CHANGELOG; build</name>
  <read_first>
    - convex/integrations/bigseller/__tests__/cron.test.ts (L1-25 harness; pollAttempt usage at L27/57/102)
    - 83-PATTERNS.md Flag #3 ("Add a unit test for pollDelayMs (15/15/15/30/30/60/60/60 for attempts 0..7) and verify max-attempts bound. This is the cleanest place to lock O3.")
    - docs/CHANGELOG.md (top entry format)
  </read_first>
  <behavior>
    - pollDelayMs maps attempts 0..7 to [15000,15000,15000,30000,30000,60000,60000,60000]
    - the ramp never exceeds 60000 and the schedule respects BIGSELLER_MAX_POLLS = 8
  </behavior>
  <action>
There is NO literal 60000 assertion to edit in cron.test.ts (Flag #3). Add a NEW `describe("pollDelayMs adaptive ramp (O3)")` to `convex/integrations/bigseller/__tests__/cron.test.ts` (it already imports config constants):
- `it("ramps 15s ×3, 30s ×2, 60s thereafter")` — assert `[0,1,2,3,4,5,6,7].map(pollDelayMs)` deep-equals `[15000,15000,15000,30000,30000,60000,60000,60000]`.
- `it("keeps the worst-case bound: max polls unchanged at 8")` — assert `BIGSELLER_MAX_POLLS === 8`.
Import `pollDelayMs` and `BIGSELLER_MAX_POLLS` from `../config`.

CHANGELOG entry: "Phase 83-05: BigSeller sync O3 — adaptive poll interval (15s ×3 / 30s ×2 / 60s thereafter) replaces the flat 60s; max poll count unchanged at 8 so the worst-case bound is preserved. Cuts ~3-5 min off typical short-window syncs." Run the build gate.
  </action>
  <verify>
    <automated>npm run test -- bigseller &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'pollDelayMs' convex/integrations/bigseller/__tests__/cron.test.ts` returns >= 1
    - `grep -c '15000' convex/integrations/bigseller/__tests__/cron.test.ts` returns >= 1
    - `grep -ci '83-05' docs/CHANGELOG.md` returns >= 1
    - `npm run test -- bigseller` exits 0
    - `npm run build` exits 0
  </acceptance_criteria>
  <done>New ramp test locks 15/30/60 + max-8 bound; CHANGELOG records O3; build green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| scheduler-chain self-reschedule | pollSyncTask reschedules itself via ctx.scheduler.runAfter; no external input. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-83-05-01 | DoS / retry flood | pollSyncTask reschedule | mitigate | `BIGSELLER_MAX_POLLS = 8` is unchanged; the faster early ramp does not increase the attempt count, so the worst-case wall-clock bound stays bounded and the cron-overlap guard (T-79-08/09/10) is unaffected. (Tasks 1-3) |
| T-83-05-02 | Tampering | delay computation | accept | `pollDelayMs` is pure, deterministic, attempt-driven — no external/attacker input. |
</threat_model>

<verification>
- `npm run type-check` — helper + swaps compile.
- `npm run test -- bigseller` — ramp test + existing cron/sync suite green.
- `npm run build` — passes.
</verification>

<success_criteria>
- pollDelayMs ramps 15/15/15/30/30/60/60/60 for attempts 0..7; max polls stays 8.
- All 4 reschedule sites use pollDelayMs(currentAttempt); no flat-interval reschedule remains.
- New ramp test locks the schedule; CHANGELOG records O3; bigseller suite + build green.
</success_criteria>

<output>
After completion, create `.planning/phases/83-bigseller-pagelist-refresh/83-05-SUMMARY.md`
</output>
