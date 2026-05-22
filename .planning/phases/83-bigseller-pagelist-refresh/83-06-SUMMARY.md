---
phase: 83-bigseller-pagelist-refresh
plan: 06
subsystem: bigseller-integration
tags: [sync-performance, pagesize, har-fixtures, o6]
requires:
  - "buildPageListBody reads BIGSELLER_PAGE_SIZE (existing, helpers.ts:61 — only consumer)"
  - "3 HAR pageList fixtures (existing, __tests__/fixtures/2026-05-19-*)"
provides:
  - "BIGSELLER_PAGE_SIZE = 100 with empirical-revert comment"
  - "3 fixtures + helpers-test value assertion locked to pageSize 100 (single source of truth)"
affects:
  - "convex/integrations/bigseller/config.ts (constant bumped 50 → 100)"
  - "convex/integrations/bigseller/__tests__/fixtures/2026-05-19-{common,shopee,tiktok}-pageList-body.json"
  - "convex/integrations/bigseller/__tests__/helpers.test.ts (bare property check → value assertion)"
  - "docs/CHANGELOG.md (O6 + revert runbook)"
tech-stack:
  added: []
  patterns:
    - "HAR fixture as single source of truth: a request-body constant change moves the config value, all fixture JSONs, AND the helpers-test value assertion in lockstep (lesson 83-01a) — no fixture/config drift."
key-files:
  created: []
  modified:
    - "convex/integrations/bigseller/config.ts"
    - "convex/integrations/bigseller/__tests__/fixtures/2026-05-19-common-pageList-body.json"
    - "convex/integrations/bigseller/__tests__/fixtures/2026-05-19-shopee-pageList-body.json"
    - "convex/integrations/bigseller/__tests__/fixtures/2026-05-19-tiktok-pageList-body.json"
    - "convex/integrations/bigseller/__tests__/helpers.test.ts"
    - "docs/CHANGELOG.md"
decisions:
  - "Strengthened the bare `expect(body).toHaveProperty('pageSize')` check to `toHaveProperty('pageSize', 100)` so the fixture↔config link is mechanically locked (T-83-06-02 mitigate)."
  - "orderState assertions left untouched (D-02: legacy 5-value orderState still accepted; 01b archived). Note: fixture JSONs carry a 3-value orderState but helpers.test.ts builds the body via buildPageListBody (live config) and asserts length 5 — that path is unrelated to pageSize and was not touched."
metrics:
  duration_min: 4
  completed: 2026-05-22
  tasks: 3
  files: 6
  commits: 3
---

# Phase 83 Plan 06: PageSize Bump (O6) Summary

Raised `BIGSELLER_PAGE_SIZE` 50 → 100 — one number at `config.ts`, the lowest-effort BigSeller sync optimization (D-05 low-risk-first #3). `buildPageListBody` (helpers.ts:61) is the only consumer, so the request body now carries `pageSize: 100`, halving the page count per platform for a full-month sync. Per lesson 83-01a the 3 HAR pageList fixtures and the helpers-test value assertion moved in lockstep, keeping the fixture the single source of truth. Empirically reversible: if BigSeller rejects 100 with `code:-1` (no data loss), the documented revert runbook restores 50.

## What Was Built

1. **`BIGSELLER_PAGE_SIZE = 100` with empirical-revert comment (Task 1):** in `convex/integrations/bigseller/config.ts`. The comment pins the rationale (50 is the BigSeller default-UI page size; 100 was not confirmed as a server-enforced max) and the revert instruction if `code:-1` appears.
2. **3 fixtures + helpers-test value assertion to 100 (Task 2):** the 3 HAR fixtures (`2026-05-19-{common,shopee,tiktok}-pageList-body.json`) moved `"pageSize": 50` → `100` at line 3 each; `helpers.test.ts` bare `toHaveProperty("pageSize")` strengthened to `toHaveProperty("pageSize", 100)`. The HAR key-set lock test (L205-228) is key-only and was unaffected; orderState length-5 assertion untouched (D-02).
3. **CHANGELOG O6 + revert runbook (Task 3):** records the bump and a 4-step revert runbook (config → fixtures → helpers-test assertion → comment pin), noting no data loss either way.

## Verification

| Gate | Result |
|------|--------|
| `npm run type-check` | PASS (Task 1; zero errors) |
| `npm run test -- bigseller` | PASS — 191 tests / 15 files (unchanged count; existing tests now assert the new value) |
| `npm run build` | PASS (EXIT=0, `✓ built in 21.91s`, no chunk-size breach) |

## Acceptance Criteria

- Task 1: `grep -c 'BIGSELLER_PAGE_SIZE = 100' config.ts` = 1 ✓; `grep -c 'BIGSELLER_PAGE_SIZE = 50' config.ts` = 0 ✓; type-check exit 0 ✓
- Task 2: `grep -c '"pageSize": 100'` = 1 in each of the 3 fixtures ✓; `grep -c 'toHaveProperty("pageSize", 100)' helpers.test.ts` = 1 ✓; `npm run test -- bigseller` exit 0 ✓
- Task 3: `grep -ci '83-06' CHANGELOG.md` = 1 (≥1) ✓; `grep -ci 'pageSize' CHANGELOG.md` = 5 (≥1) ✓; build exit 0 ✓

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Compliance

| Threat ID | Disposition | Implemented |
|-----------|-------------|-------------|
| T-83-06-01 (DoS / availability — pageList rejection) | accept | `code:-1` on rejection carries no data loss; existing fail-fast layer surfaces it; revert runbook (Task 3) restores 50 — as designed |
| T-83-06-02 (Tampering — fixture/config drift) | mitigate | 3 fixtures + helpers-test value assertion moved in lockstep with the config constant; HAR fixture stays single source of truth (lesson 83-01a) — DONE (Task 2) |

No new threat surface, no new network endpoints, no auth paths, no schema changes.

## Known Stubs

None.

## Commits

- `4f850e76` feat(83-06): raise BigSeller pageSize 50 -> 100 (O6)
- `d3b3e773` test(83-06): move 3 HAR fixtures + helpers test to pageSize 100 (O6)
- `9dced05e` docs(83-06): CHANGELOG O6 pageSize bump + revert runbook

## Self-Check: PASSED

- Modified files exist: `config.ts`, 3 fixture JSONs, `helpers.test.ts`, `docs/CHANGELOG.md` — all FOUND.
- Commits exist in git log: 4f850e76, d3b3e773, 9dced05e — all FOUND.
