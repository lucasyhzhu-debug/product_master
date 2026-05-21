---
phase: 83-bigseller-pagelist-refresh
plan: 06
type: execute
wave: 3
depends_on: ["83-05-adaptive-polling"]
files_modified:
  - convex/integrations/bigseller/config.ts
  - convex/integrations/bigseller/__tests__/fixtures/2026-05-19-common-pageList-body.json
  - convex/integrations/bigseller/__tests__/fixtures/2026-05-19-shopee-pageList-body.json
  - convex/integrations/bigseller/__tests__/fixtures/2026-05-19-tiktok-pageList-body.json
  - convex/integrations/bigseller/__tests__/helpers.test.ts
  - docs/CHANGELOG.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "BIGSELLER_PAGE_SIZE is 100, halving the page count for a full-month sync (D-05 O6)"
    - "The HAR-fixture pageSize stays the single source of truth — all 3 fixtures and the helpers test assert pageSize 100 (Memory lesson: fixtures are the single source of truth)"
    - "If BigSeller rejects pageSize 100 with code:-1 in prod, the value reverts to 50 with an empirical-limit comment (D-05 O6 caveat)"
  artifacts:
    - path: "convex/integrations/bigseller/config.ts"
      provides: "BIGSELLER_PAGE_SIZE = 100"
      contains: "BIGSELLER_PAGE_SIZE = 100"
  key_links:
    - from: "convex/integrations/bigseller/helpers.ts"
      to: "BIGSELLER_PAGE_SIZE"
      via: "pageSize field in buildPageListBody"
      pattern: "pageSize: BIGSELLER_PAGE_SIZE"
---

<objective>
O6 — raise BigSeller pageSize 50 → 100 (D-05, low-risk-first #3). One number at `config.ts:49`. Halves the page count per platform for a full-month sync. SPEC O6: revert to 50 with an empirical-limit comment if BigSeller returns `code:-1` (low risk — `code:-1` if rejected, no data loss).

Per the Memory lesson (83-01a triple-review): the HAR fixtures are the SINGLE source of truth for the request body, so the 3 fixture JSON files and the helpers test must move to `pageSize: 100` in lockstep — do not let the fixture drift from the live config.

Purpose: ~50% fewer page round-trips. Lowest-effort optimization; empirically reversible.
Output: config change, 3 fixture updates, helpers-test pageSize value assertion, CHANGELOG with the revert runbook.
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
<!-- config.ts:49 export const BIGSELLER_PAGE_SIZE = 50; -->
<!-- helpers.ts:61 pageSize: BIGSELLER_PAGE_SIZE (the only consumer) -->
<!-- 3 fixtures hard-code "pageSize": 50 at line 3 each. -->
<!-- helpers.test.ts:93 `expect(body).toHaveProperty("pageSize")` — currently NO value assertion. -->
<!-- helpers.test.ts:205-228 HAR-fixture key-set lock — KEY-ONLY (does not assert pageSize VALUE), so changing the number won't break the lock test. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Bump BIGSELLER_PAGE_SIZE to 100 with revert comment</name>
  <read_first>
    - convex/integrations/bigseller/config.ts (L48-49)
    - convex/integrations/bigseller/helpers.ts (L61 the only consumer)
    - 83-02-sync-optimization-SPEC.md O6 (revert to 50 with empirical-limit comment if code:-1)
  </read_first>
  <action>
In `convex/integrations/bigseller/config.ts:49`:
```typescript
/**
 * Page size for BigSeller pageList API requests.
 * Phase 83-06 / O6: raised 50 → 100 to halve the page count per platform.
 * EMPIRICAL LIMIT: if BigSeller starts returning code:-1 on pageList, revert
 * to 50 and pin the working maximum here (50 is the BigSeller default-UI page
 * size; 100 was not confirmed as a server-enforced max before this change).
 */
export const BIGSELLER_PAGE_SIZE = 100;
```
No other code change — `helpers.ts:61` reads the constant.
  </action>
  <verify>
    <automated>npm run type-check</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'BIGSELLER_PAGE_SIZE = 100' convex/integrations/bigseller/config.ts` returns 1
    - `grep -c 'BIGSELLER_PAGE_SIZE = 50' convex/integrations/bigseller/config.ts` returns 0
    - `npm run type-check` exits 0
  </acceptance_criteria>
  <done>BIGSELLER_PAGE_SIZE is 100 with the empirical-revert comment; type-check green.</done>
</task>

<task type="auto">
  <name>Task 2: Update 3 fixtures + add pageSize value assertion in helpers.test.ts</name>
  <read_first>
    - convex/integrations/bigseller/__tests__/fixtures/2026-05-19-common-pageList-body.json (L3 "pageSize": 50)
    - convex/integrations/bigseller/__tests__/fixtures/2026-05-19-shopee-pageList-body.json (L3)
    - convex/integrations/bigseller/__tests__/fixtures/2026-05-19-tiktok-pageList-body.json (L3)
    - convex/integrations/bigseller/__tests__/helpers.test.ts (L93 the bare pageSize property check)
    - 83-PATTERNS.md "HAR-fixture body-shape lock tests" (fixture JSON is the SINGLE source of truth — do not inline arrays)
  </read_first>
  <action>
Memory lesson 83-01a: the fixtures are the single source of truth for the request body shape and values; keep them in lockstep with config.

1. In all 3 fixture JSON files, change `"pageSize": 50,` → `"pageSize": 100,` (line 3 each).

2. In `helpers.test.ts:93`, strengthen the bare property check to a value assertion so the fixture↔config link is mechanically locked:
```typescript
    expect(body).toHaveProperty("pageSize", 100);
```

3. The HAR-fixture key-set lock test (L205-228) is key-only and unaffected — leave it. Do NOT touch the `orderState` length-5 assertions (D-02: legacy 5-value orderState is still accepted; 01b is archived).
  </action>
  <verify>
    <automated>npm run test -- bigseller</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '"pageSize": 100' convex/integrations/bigseller/__tests__/fixtures/2026-05-19-common-pageList-body.json` returns 1
    - `grep -c '"pageSize": 100' convex/integrations/bigseller/__tests__/fixtures/2026-05-19-shopee-pageList-body.json` returns 1
    - `grep -c '"pageSize": 100' convex/integrations/bigseller/__tests__/fixtures/2026-05-19-tiktok-pageList-body.json` returns 1
    - `grep -c 'toHaveProperty("pageSize", 100)' convex/integrations/bigseller/__tests__/helpers.test.ts` returns 1
    - `npm run test -- bigseller` exits 0
  </acceptance_criteria>
  <done>All 3 fixtures + the helpers test assert pageSize 100, in lockstep with config; orderState assertions untouched; bigseller suite green.</done>
</task>

<task type="auto">
  <name>Task 3: CHANGELOG with revert runbook; build</name>
  <read_first>
    - docs/CHANGELOG.md (top entry format)
    - 83-02-sync-optimization-SPEC.md O6
  </read_first>
  <action>
CHANGELOG entry: "Phase 83-06: BigSeller sync O6 — raised pageList pageSize 50 → 100 (halves page count per platform). REVERT RUNBOOK: if a manual/cron sync returns `code:-1` after this lands, set `BIGSELLER_PAGE_SIZE` back to 50 in `convex/integrations/bigseller/config.ts`, set the 3 fixture `pageSize` values back to 50, restore the helpers-test `toHaveProperty('pageSize', 50)` assertion, and pin 50 as the empirical server max in the config comment. No data loss either way — `code:-1` just means the request was rejected." Run the build gate.
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `grep -ci '83-06' docs/CHANGELOG.md` returns >= 1
    - `grep -ci 'pageSize' docs/CHANGELOG.md` returns >= 1
    - `npm run build` exits 0
  </acceptance_criteria>
  <done>CHANGELOG records O6 with the revert runbook; build green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| action runtime → BigSeller pageList | A request-body constant changes; response is parsed as before. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-83-06-01 | DoS / availability | pageList request | accept | If BigSeller rejects pageSize 100 it returns `code:-1` with no data loss; the existing fail-fast layer surfaces it and the documented revert runbook restores 50. (Task 3) |
| T-83-06-02 | Tampering | fixture/config drift | mitigate | The 3 fixtures + helpers-test value assertion are moved in lockstep with the config constant, keeping the HAR fixture the single source of truth (Memory lesson 83-01a). (Task 2) |
</threat_model>

<verification>
- `npm run type-check` — config change compiles.
- `npm run test -- bigseller` — fixtures + helpers test green at pageSize 100.
- `npm run build` — passes.
</verification>

<success_criteria>
- BIGSELLER_PAGE_SIZE is 100 with an empirical-revert comment.
- 3 fixtures + helpers test assert pageSize 100 in lockstep.
- orderState length-5 assertions untouched (D-02).
- CHANGELOG records O6 + revert runbook; bigseller suite + build green.
</success_criteria>

<output>
After completion, create `.planning/phases/83-bigseller-pagelist-refresh/83-06-SUMMARY.md`
</output>
