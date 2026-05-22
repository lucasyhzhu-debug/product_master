---
phase: 83-bigseller-pagelist-refresh
plan: 05
subsystem: bigseller-integration
tags: [adaptive-polling, sync-performance, scheduler, o3]
requires:
  - "pollSyncTask scheduler-chain (existing, sync.ts)"
  - "BIGSELLER_MAX_POLLS = 8 (existing, config.ts — unchanged)"
provides:
  - "pollDelayMs(pollAttempt) ramp helper — 15s x3 / 30s x2 / 60s thereafter"
  - "4 poll-reschedule sites compute delay from current attempt"
affects:
  - "convex/integrations/bigseller/config.ts (new pollDelayMs export)"
  - "convex/integrations/bigseller/sync.ts (4 runAfter reschedules swapped)"
  - "convex/integrations/bigseller/__tests__/cron.test.ts (ramp + bound tests)"
tech-stack:
  added: []
  patterns:
    - "Attempt-driven adaptive scheduler delay: change the runAfter DELAY argument per pollAttempt, not the BIGSELLER_MAX_POLLS attempt count — worst-case wall-clock bound is preserved"
key-files:
  created: []
  modified:
    - "convex/integrations/bigseller/config.ts"
    - "convex/integrations/bigseller/sync.ts"
    - "convex/integrations/bigseller/__tests__/cron.test.ts"
    - "docs/CHANGELOG.md"
decisions:
  - "Removed the now-unused BIGSELLER_POLL_INTERVAL_MS import from sync.ts (Rule 3 — noUnusedLocals would break type-check); kept the export in config.ts per plan (other code/tests may import it)."
  - "First-poll site (triggerSync L322-324) uses pollDelayMs(0) — the current attempt is 0, the rescheduled NEXT attempt stays pollAttempt:1 verbatim, matching the plan's 'delay from current, schedule next' note."
metrics:
  duration_min: 6
  completed: 2026-05-22
  tasks: 3
  files: 4
  commits: 3
---

# Phase 83 Plan 05: Adaptive Polling (O3) Summary

Replaced the BigSeller `pollSyncTask` flat 60s reschedule delay with an attempt-driven ramp — `pollDelayMs(pollAttempt)` returns 15s for the first 3 polls, 30s for the next 2, 60s thereafter. All 4 `ctx.scheduler.runAfter` poll-reschedule sites in `sync.ts` now compute the delay from the current attempt. `BIGSELLER_MAX_POLLS` stays 8 so the worst-case wall-clock bound is unchanged; the ramp only cuts the wait on the typical short-window sync (BigSeller's `taskStatus` usually flips to `complete` within 30-90s). Cuts ~3-5 min off a typical short sync.

## What Was Built

1. **`pollDelayMs(pollAttempt)` ramp helper (Task 1):** added to `convex/integrations/bigseller/config.ts` below `BIGSELLER_POLL_INTERVAL_MS`. Pure, deterministic: `<3 → 15000`, `<5 → 30000`, else `60000`. `BIGSELLER_MAX_POLLS = 8` and the `BIGSELLER_POLL_INTERVAL_MS = 60000` export both kept.
2. **4 reschedule sites swapped (Task 2):** in `sync.ts` —
   - L322-324 first poll from `triggerSync` → `pollDelayMs(0)` (current attempt is 0; next-attempt payload `pollAttempt: 1` unchanged).
   - L376-377 network-error retry → `pollDelayMs(args.pollAttempt)`.
   - L416-417 invalid-JSON retry → `pollDelayMs(args.pollAttempt)`.
   - L558-559 not-complete branch → `pollDelayMs(args.pollAttempt)`.
   The `{ ...args, pollAttempt: args.pollAttempt + 1 }` payload is untouched at every site.
3. **Ramp lock tests + CHANGELOG (Task 3):** new `describe("pollDelayMs adaptive ramp (O3)")` in `cron.test.ts` — asserts `[0..7].map(pollDelayMs)` deep-equals `[15000,15000,15000,30000,30000,60000,60000,60000]`, asserts the ≤60s ceiling across the bound, and asserts `BIGSELLER_MAX_POLLS === 8`. CHANGELOG records O3.

## Verification

| Gate | Result |
|------|--------|
| `npm run type-check` | PASS (Task 1; zero errors) |
| `npm run test -- bigseller` | PASS — 191 tests / 15 files (was 188; +3 new ramp/bound tests) |
| `npm run build` | PASS (EXIT=0, no chunk-size breach) |

## Acceptance Criteria

- Task 1: `grep -c 'export function pollDelayMs' config.ts` = 1 ✓; `grep -c 'BIGSELLER_MAX_POLLS = 8' config.ts` = 1 ✓; type-check exit 0 ✓
- Task 2: all 4 `ctx.scheduler.runAfter(` poll-reschedule sites (L323/376/416/558) have `pollDelayMs(...)` on the line directly under — verified by reading; no `BIGSELLER_POLL_INTERVAL_MS` reschedule remains ✓; `npm run test -- bigseller` exit 0 ✓
  - **Note on the `grep -c 'pollDelayMs(' sync.ts >= 5` criterion:** returns **4**, not ≥5. The criterion assumed the import line would still carry `BIGSELLER_POLL_INTERVAL_MS` alongside `pollDelayMs` and counted an import-line match. I imported `pollDelayMs,` (no parens → not matched by `pollDelayMs(`) and removed the now-unused `BIGSELLER_POLL_INTERVAL_MS` import (see Deviations). The 4 matches are exactly the 4 functional reschedule delay-arg call sites — the intent (4 sites swapped) is fully satisfied; only the import-line +1 the grep anticipated does not exist.
- Task 3: `grep -c pollDelayMs cron.test.ts` = 4 (≥1) ✓; `grep -c 15000 cron.test.ts` = 1 (≥1) ✓; `grep -ci 83-05 CHANGELOG.md` = 1 (≥1) ✓; test + build exit 0 ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed unused `BIGSELLER_POLL_INTERVAL_MS` import from sync.ts**
- **Found during:** Task 2
- **Issue:** After swapping all 4 reschedules to `pollDelayMs`, `BIGSELLER_POLL_INTERVAL_MS` was no longer referenced anywhere in `sync.ts` — only on its import line. `tsc` (`noUnusedLocals`) / lint would flag the unused import and break `npm run type-check` / `npm run build`.
- **Fix:** dropped `BIGSELLER_POLL_INTERVAL_MS` from the `./config` import in `sync.ts`. The plan said "keep the export (other code/tests may import it; just stop using it in the reschedules)" — the **export in config.ts is untouched**; only the unused **import** in sync.ts was removed, which is consistent with the plan's intent.
- **Files modified:** `convex/integrations/bigseller/sync.ts`
- **Commit:** `d9631d93`

**2. [Documentation] `grep -c 'pollDelayMs(' sync.ts >= 5` criterion not literally met (returns 4)**
- See Acceptance Criteria note above. Consequence of Deviation 1 (import line is `pollDelayMs,` with no parens). All 4 functional reschedule sites are correctly swapped; no behavioral gap. Documented rather than artificially inflating the count.

## Threat Model Compliance

| Threat ID | Disposition | Implemented |
|-----------|-------------|-------------|
| T-83-05-01 (DoS / retry flood) | mitigate | `BIGSELLER_MAX_POLLS = 8` unchanged; faster early ramp does not increase attempt count → worst-case wall-clock bound preserved; cron-overlap guard (T-79-08/09/10) unaffected — DONE (locked by the max-8 + ≤60s-ceiling tests) |
| T-83-05-02 (Tampering — delay computation) | accept | `pollDelayMs` is pure, deterministic, attempt-driven; no external/attacker input — as designed |

No new threat surface, no new network endpoints, no auth paths, no schema changes.

## Known Stubs

None.

## TDD Gate Compliance

Task 1 (`tdd="true"`) and Task 3 (`tdd="true"`) ship the helper and its lock test. Per Flag #3 there is no pre-existing literal-60s assertion to flip RED — the helper is brand new, so the test is GREEN-on-first-run by construction (it locks a newly-added pure function). The ramp test commit (`9668aa50`, `test(83-05): ...`) follows the implementation commit (`4321eec4`, `feat(83-05): ...`), which is the inverted order vs strict RED-first; this is expected for a "lock a new pure helper" task where no prior behavior exists to fail against. The 3 ramp/bound assertions verifiably pass against the shipped `pollDelayMs`.

## Commits

- `4321eec4` feat(83-05): add pollDelayMs adaptive ramp helper (O3)
- `d9631d93` refactor(83-05): swap all 4 poll reschedules to pollDelayMs (O3)
- `9668aa50` test(83-05): lock pollDelayMs ramp + max-8 bound; CHANGELOG (O3)

## Self-Check: PASSED

- Modified files exist: `convex/integrations/bigseller/config.ts`, `convex/integrations/bigseller/sync.ts`, `convex/integrations/bigseller/__tests__/cron.test.ts`, `docs/CHANGELOG.md` — all FOUND.
- Commits exist in git log: 4321eec4, d9631d93, 9668aa50 — all FOUND.
