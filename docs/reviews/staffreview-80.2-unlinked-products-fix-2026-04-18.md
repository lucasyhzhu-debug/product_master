# Staff Review: Phase 80.2 Unlinked Products Fix (K3Mart + Direct)

**Date:** 2026-04-18
**Plans:** `.planning/phases/80.2-unlinked-products-fix/80.2-{01,02,03,04}-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Iteration context:** Final gate after 2 plan-checker iterations (4 blockers + 5 warnings → 0 blockers + 1 warning + 1 info → all addressed). Replan was driven by GSD v1.36.0 introduction of `gsd-pattern-mapper`.

---

## 1. Summary

**Overall Assessment:** **Approve with Refinements**

The 4-wave split is sound, the schema-extension bundle (index + `summary` field in a single commit) was the right call, and the `attachLinkedMenuProductId` extraction correctly avoids introducing fetch-stub test infrastructure. The novel paginated-WRITE pattern in Plan 02 is the only architecturally-novel piece and it's appropriately flagged. Three Refinement-level concerns surfaced below — none block execution but each saves a future cycle.

✅ Plan structure validated (Git Workflow + Implementation Waves + Documentation Updates + Success Criteria all present in every plan).

---

## 2. Critical Issues (Must Fix)

**None.**

The two prior plan-checker iterations caught the schema-fidelity issues (`completedAt` / `matchConfidence` enum / saveRevenueItemsImpl return contract / `errorMessage` misuse). The seeders were the last residual bug class, and they have been patched with the full required-field enumeration verified against `convex/schema.ts:177-345`.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Add a Wave 4.5b post-merge verification: re-run `npm run test` against `main` to catch any merge-time regression before the prod backfill | Medium | Low |
| 2 | Plan 02 Task 2.4 guard swap should explicitly handle the case where `hasExternalRevenueItemsQuery` itself fails (Convex query error vs absent row) | Medium | Low |
| 3 | Plan 04 Task 4.7 (K3Mart cascade prod run) should specify the **set** of mappings to invoke against, not "for each existing K3Mart mapping" — that's an unbounded loop with no stopping criterion if a mapping is added mid-run | Medium | Low |

### Improvement 1: Post-merge regression gate

The current Plan 04 sequence is:
1. Local gates (4.1)
2. Pre-flight (4.2)
3. Dev smoke (4.3)
4. User checkpoint (4.4)
5. Convex export (4.5)
6. Prod backfill (4.6)
7. Prod cascade (4.7)
8. Visual verify (4.8)

But the workflow note at the top of Plan 04 indicates the actual sequence interleaves a merge-to-main between steps 4 and 6 (because Convex CI deploys on merge). After merge, `main`'s test suite runs in CI but no explicit "pull main, re-test locally" gate exists between merge and prod backfill invocation. If the merge surfaces a conflict resolution that broke the backfill mutation, the operator could discover it mid-prod-run.

**Recommendation:** Add Task 4.5b — "Pull `main` after merge; re-run `npm run test` locally; confirm the new `backfillInternalRevenueItems` mutation is reachable via `npx convex function-spec --prod | grep backfillInternalRevenueItems` before invoking it."

### Improvement 2: Guard query failure mode

Plan 02 Task 2.4 swaps `if (!isNew) continue;` for `if (!isNew && await hasExternalRevenueItemsQuery(...)) continue;`. What happens if the query throws (e.g. Convex transient unavailability)? The current plan's behavior would be to throw out of the entire `syncInternalOrders` action, halting the sync.

**Recommendation:** Either (a) wrap the existence check in a try/catch that defaults to "skip" on error (preserving today's behavior), or (b) explicitly document that a query failure halts the sync (which may actually be the correct behavior — better to halt than to silently re-create children we can't verify don't exist). The plan currently makes neither choice explicit. Pick one and add it to Task 2.4's `<acceptance_criteria>`.

### Improvement 3: Bounded prod cascade invocation

Plan 04 Task 4.7 says "for each existing K3Mart mapping in admin UI, invoke `applyRetroactiveProductMapping`." Two issues:
- No explicit count assertion: how many mappings are there? The plan should snapshot the count via `npx convex data externalProductMappings --prod | jq '[.[] | select(.source == "k3mart")] | length'` BEFORE the loop and after, with the operator confirming the loop count matches the snapshot.
- A mapping added by another operator mid-run would be processed late or missed entirely.

**Recommendation:** Add a snapshot step. Suggested form: "Capture the K3Mart mapping ID set BEFORE starting; iterate over that frozen set only; if the in-flight count of mappings has changed at the end, log it and re-run for the delta."

---

## 4. Refinements (Minor Suggestions)

- Plan 01 Task 1.1's `<verify>` block runs `npx convex codegen` but doesn't snapshot the generated `convex/_generated/api.d.ts` for the schema-only change — the codegen output is a side-effect of the schema push. Consider asserting `git diff --stat convex/_generated/` shows ONLY the expected delta.
- Plan 02's Risk Register mentions Convex 4000-row write cap, but the test in Plan 03 Task 3.3 doesn't seed enough parents to exercise pagination. Add a 250-parent seed scenario as an optional 7th test case to verify the cursor loop works (current dataset is 262, so the fix-as-deployed will exercise cursor in dev anyway, but a unit-level cursor test would add confidence).
- Plan 03 Task 3.5 asserts `unlinked?.revenue ?? 0` `.toBe(0)` — strictly tighter than the post-fix behavior. If the fixture happens to include a non-deterministic `(unlinked)` bucket from another source, the assertion would falsely fail. Consider instead asserting `unlinked` is `undefined` (i.e., no UNLINKED bucket in the result at all).
- Plan 04 Task 4.10 lists 5 docs to update including MEMORY.md. The order of updates matters for the post-merge MEMORY.md write (it needs the verification block from DEBUG.md as evidence). Consider numbering the substeps explicitly (4.10a CHANGELOG, 4.10b SCHEMA, 4.10c API_REFERENCE, 4.10d DEBUG.md, 4.10e MEMORY.md).
- The phrase "novel pattern for this codebase" appears in Plan 02 and Plan 03 — consider extracting both flag-callouts into a single "Phase Novelty Register" at the top of CONTEXT.md so the post-mortem audit has one place to look when judging whether the patterns took root.

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| Shopee/TikTok cascade branch | `convex/externalData/mutations.ts:488-593` | Plan 01 Task 1.3 mirrors this verbatim for K3Mart — already aligned ✓ |
| `saveRevenueItems` dedup | `convex/externalData/mutations.ts:752-760` | Plan 02 Task 2.2 reuses via `saveRevenueItemsImpl` extraction — preserves dedup contract ✓ |
| `getOutletNameToIdMap` query shape | `convex/externalData/queries.ts:99-114` | Plan 01 Task 1.2 `getK3MartMappingBySku` mirrors the `Map<>` return convention ✓ |
| `requireRole + token: v.string()` admin pattern | `convex/lib/auth.ts` + `applyRetroactiveProductMapping` (mutations.ts:606-632) | Plan 02 Task 2.3 mirrors this for `backfillInternalRevenueItems` ✓ |
| Admin-token test harness | `convex/externalData/__tests__/retroactive-mapping-shopee.test.ts:26-36` | Plan 03 Tasks 3.1, 3.3 reuse verbatim ✓ |
| `helpers.test.ts` pure-helper pattern | `convex/integrations/k3mart/__tests__/helpers.test.ts` | Plan 03 Task 3.2 mirrors for `attachLinkedMenuProductId` ✓ |

### Potential Duplication Risks

- **`hasExternalRevenueItems` is invoked twice** (backfill loop + guard fix), but Plan 02 introduces both an in-process import (helper) AND an internal query wrapper (`hasExternalRevenueItemsQuery`). Confirm the wrapper is genuinely necessary — it is, because `syncInternalOrders` is an action and actions can't call helpers directly. Document this in the helper's docblock so future readers don't try to "consolidate."
- **K3Mart mapping pre-fetch logic** appears at 3 places by the end of Wave 1: the existing inline at `mutations.ts:536-562`, the new `getK3MartMappingBySku`, and the inline overlay at line 552-562. Plan 01 doesn't attempt to consolidate. That's correct for surgical fix scope, but worth noting in the post-mortem CHANGELOG entry as future tech debt.

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Wave 1 (schema + K3Mart) | ✅ Good | Schema commit isolated for rollback; K3Mart cascade + sync linking grouped |
| Wave 2 (Direct backfill + heal) | ✅ Good | `hasExternalRevenueItems` extracted before its two consumers; novel-pattern flag prominent |
| Wave 3 (tests) | ✅ Good | Sequential after Waves 1+2; reuses real helpers; novel `t.action` pattern attempted with documented fallback |
| Wave 4 (verification + prod) | ⚠ See Improvements 1+3 | Sequence is correct; needs post-merge regression gate and bounded cascade invocation |

**Ordering Issues:** None. Wave 2 correctly depends on Wave 1's `getK3MartMappingBySku` not being needed (it isn't — Wave 2 uses `hasExternalRevenueItems` only). Wave 3's tests correctly depend on Waves 1+2 code being on disk.

**Missing Phases:** None — the 4-wave split is appropriate. A 5th wave (post-prod monitoring) is debatable but the verification block in DEBUG.md serves the same purpose.

---

## 7. Specialist Agent Recommendations

| Plan | Recommended Agent | Rationale |
|------|-------------------|-----------|
| 80.2-01 (schema + K3Mart) | `convex-backend` | Schema edit + cascade extension + helper file work — pure backend |
| 80.2-02 (Direct backfill + heal) | `convex-backend` | Mutation extraction + new admin mutation + adapter guard swap — pure backend |
| 80.2-03 (tests) | `tdd-test-architect` | All 5 files are new vitest + convex-test files; this agent specializes in the convex-test harness pattern |
| 80.2-04 (verification + prod) | (manual / orchestrator) | Human checkpoint at 4.4 means autonomous execution is `false`; route via `cto-orchestrator` for dispatch but operator drives 4.4-4.7 |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | ✅ `fix/unlinked-products-k3mart-direct` (every plan repeats this) |
| Branch naming convention | ✅ `fix/...` per CLAUDE.md |
| Merge strategy documented | ✅ Single PR after Wave 4; no per-plan merges |

### Commit Strategy

| Plan | Expected Commits | Type |
|------|------------------|------|
| 01 | 2 (schema + code) | `feat(schema)` then `fix(revenue)` |
| 02 | 1 (backfill + heal bundled) | `fix(revenue)` |
| 03 | 1 (all 5 test files) | `test(revenue)` |
| 04 | 1 (docs) + PR | `docs:` then PR open |

✅ Atomic commits, natural boundaries, build-verified before push.

### Pre-Push Verification
- [✓] Plan includes `npm run build` check (Plan 04 Task 4.1)
- [✓] Plan includes `npm run type-check` verification (Plan 04 Task 4.1)
- [✓] Plan includes local testing before push (Wave 1, 2, 3 all gate on `npm run test`)

### CI/CD Considerations

| Concern | Assessment |
|---------|------------|
| Rollback strategy | ✅ Documented (Plan 02 risk register + Wave 4.5 Convex export) |
| Deployment order | ✅ Schema-only commit first; CI deploys on merge |
| Data backup needed | ✅ Wave 4.5 captures Convex export before any prod data mutation |
| Migration safety | ✅ Schema additions are additive (new index, new optional field) — non-breaking |

### Git Workflow Issues Found
- See Improvement 1 (post-merge regression gate before prod backfill).

---

## 9. Documentation Checkpoints

| Wave | Documentation Update Required |
|------|-------------------------------|
| 4 | `docs/CHANGELOG.md` (NON-NEGOTIABLE per CLAUDE.md), `docs/SCHEMA.md` (new index + new field), `docs/API_REFERENCE.md` (new mutation), `.planning/debug/unlinked-products-k3mart-direct.md` (verification block + status:resolved), MEMORY.md (lessons under "Critical Convex Lessons") |

### CHANGELOG.md Entry (Draft)

```markdown
## 2026-04-XX - Phase 80.2: Unlinked Products Fix (K3Mart + Direct)

**Restored attribution for K3Mart and Direct revenue in Unit Economics reports.**

- K3Mart retroactive cascade: mapping a K3Mart SKU in admin UI now patches all matching `externalRevenue` parents (737/737 prior unattributed).
- K3Mart sync-time linking: future K3Mart syncs insert records with `linkedMenuProductId` set when a mapping exists.
- Direct historical backfill: new admin mutation `backfillInternalRevenueItems` rebuilds `externalRevenueItems` for orphan parents pre-2026-04-10.
- Direct re-sync heal: replaced unconditional `if (!isNew) continue;` guard with existence-based check; future re-syncs self-heal missing children.
- Schema: added `by_source_productCode` index on `externalRevenue`; added optional `summary` field to `externalSyncLogs`.
- Tests: 5 new vitest files covering all 4 sub-fixes.

**Files Modified:** convex/schema.ts, convex/integrations/k3mart/{helpers.ts,queries.ts,adapter.ts}, convex/externalData/{mutations.ts,queries.ts,helpers/revenueItemsHelpers.ts}, convex/integrations/internal/adapter.ts, 5 new __tests__/* files.

**Tech debt noted:** K3Mart mapping lookup logic now exists in 3 places (existing inline at mutations.ts:536-562, new `getK3MartMappingBySku`, plus the in-cascade overlay). Future consolidation is a candidate refactor.
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** **Adequate**

### Planned Tests

| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend mutation | K3Mart cascade branch (4 scenarios) | convex-test | Planned ✓ (Plan 03 Task 3.1) |
| Backend pure helper | `attachLinkedMenuProductId` (5 scenarios) | vitest pure | Planned ✓ (Plan 03 Task 3.2) |
| Backend mutation | `backfillInternalRevenueItems` (6 scenarios) | convex-test | Planned ✓ (Plan 03 Task 3.3) |
| Backend action | `syncInternalOrders` re-sync heal (2 scenarios, novel `t.action` pattern) | convex-test | Planned ✓ (Plan 03 Task 3.4) — fallback documented |
| Backend query | `skuPareto` loader attribution (2 scenarios) | convex-test | Planned ✓ (Plan 03 Task 3.5) |

### Missing Test Coverage (Refinement-tier)

| # | Gap | Why It Matters | Suggested Approach |
|---|-----|----------------|-------------------|
| 1 | Backfill mutation's cursor loop (250+ parent fixture) | Confirms paginated-WRITE works at scale, not just small-N | Optional 7th test case in Task 3.3 |
| 2 | `getK3MartMappingBySku` return shape on empty mapping table | Defensive — confirms empty-Map return is correct | One-line test in `helpers-attach-linking.test.ts` |
| 3 | `applyRetroactiveProductMapping` with `source="k3mart"` and `menuProductId: undefined` (un-link path) | Already in Task 3.1 scenario list (rollback symmetry) — verify it's actually written | Confirm during execution review |

### Test Execution Checkpoints

The plan correctly runs tests at:
1. ✓ End of Wave 1 (acceptance criterion)
2. ✓ End of Wave 2 (acceptance criterion)
3. ✓ End of Wave 3 (full suite + regression check on existing Shopee tests)
4. ✓ Wave 4 Task 4.1 (final pre-merge gate)

### Regression Risk

- `convex/externalData/__tests__/retroactive-mapping-shopee.test.ts` — must still pass with the additive return type change. Plan 03 explicitly calls this out in the "Regression Gate" section.
- `convex/externalData/__tests__/sell-through-shopee.test.ts` — must still pass with the `saveRevenueItemsImpl` extraction. Plan 03 calls this out.
- `convex/integrations/k3mart/__tests__/helpers.test.ts` — must still pass with the appended exports. Plan 03 calls this out.

---

## 11. Edge Cases to Address

The plan explicitly handles:

- [✓] K3Mart parents with null/empty `externalProductCode` (Wave 4.2 pre-flight + escalate)
- [✓] Direct orphan parents whose native order was deleted (Wave 2 `skippedMissingOrder` counter)
- [✓] Direct orphan parents with empty `orderItems` (Wave 2 `skippedEmptyOrderItems` counter)
- [✓] Backfill idempotency on second run (Plan 03 Task 3.3 scenario 6)
- [✓] Re-sync heal NOT duplicating existing children (Plan 03 Task 3.4 scenario 2)
- [✓] `applyRetroactiveProductMapping` with `menuProductId: undefined` (un-link / rollback)
- [✓] Convex 4000-row write cap (Plan 02 paginated design + acceptance assertion)
- [⚠] What happens if `hasExternalRevenueItemsQuery` itself throws? — see Improvement 2
- [⚠] What happens if a K3Mart mapping is added/changed mid-prod-cascade? — see Improvement 3

---

## 12. Approval Conditions

**For Approval (Critical):** None — no blocking issues.

**Recommended before implementation (Improvements):**
1. Add Task 4.5b post-merge regression gate (Improvement 1)
2. Make the guard-query-failure behavior explicit in Plan 02 Task 2.4 (Improvement 2)
3. Add bounded mapping-set snapshot to Plan 04 Task 4.7 (Improvement 3)

**Optional (Refinements):** 5 items in §4 — can be addressed during execution at the implementer's discretion.

**Verdict:** ✅ **APPROVE** — phase is ready for execution. The 3 Improvements are worth folding in but do not block. Hand off to execute-phase.

---

*Generated by /staffreview skill*
*Staff Developer Review (Implementation) + Principal Developer Review (Architecture)*
