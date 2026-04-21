# Staff Review: Phase 74.5.2 — Unified Deduct Cutover + Backfill + Retire Legacy Paths

**Date:** 2026-04-21
**Plans:** `.planning/phases/74.5.2-unified-deduct-cutover/74.5.2-{01..10}-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Phase artifacts:** CONTEXT.md, RESEARCH.md, PATTERNS.md, VALIDATION.md all present.

---

## 1. Summary

**Overall Assessment: Revise (Minor)**

These 10 plans are genuinely high-quality. The research pass did heavy lifting (Pitfall 1 landmine, five concrete pitfalls, verbatim pattern snippets) and the plans follow those findings faithfully. CLAUDE.md 4-section compliance is clean across all 10. The dependency graph between waves is correct. The `source: "gobiz"` landmine is called out in every plan that writes a source literal, and the plans include a type-check gate that will refuse `"gofood"` at compile time. Backfill/migration idempotency is provable (both use existence-based `by_type` / `by_source_deductedAt` filters per the Phase 80.2 lesson). Consignment Pitfall 5 is honored — no plan touches `collapseRevenuePeriod` write path.

The material issues are confined to a handful of concrete mistakes that will cause test failures or incorrect behavior on first execution, not conceptual problems with the architecture. Two are Critical (Plan 01's fix hypothesis is likely wrong given the codebase evidence; Plan 06's `ctx.runMutation` caveat is probably incorrect, which will cause the planned fallback to trigger unnecessarily), and the rest are Improvements/Refinements that should land before execution.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| C1 | Plan 01's "Fix 1 — glob suffix" hypothesis contradicts codebase evidence | Test infra / diagnosis | Plan 01 Task 1 |
| C2 | Plan 06's Convex-constraint caveat is likely incorrect and will force the fallback path needlessly | Backend / Convex semantics | Plan 06 Task 1 |
| C3 | Plan 04 migration's `by_type` index is compound `["transactionType", "createdAt"]` — query shape is fine but the plan's claim that "re-running after partial completion picks up where it left off" via cursor relies on a detail that isn't load-bearing in the proposed code | Migration correctness | Plan 04 Task 1 |
| C4 | Plan 03 seed data schema drift — `externalRevenue` schema requires `dataOrigin` + `confidence`, seed uses only `externalTransactionId`/`transactionDate`/`totalAmount`/`createdAt` | Test correctness | Plan 03 Task 1 |

### Issue C1: Plan 01 fix hypothesis contradicts codebase evidence

Plan 01 orders four fixes starting with `"../../**/*.{ts,tsx}"`. But `channelSale.test.ts` (in the same directory, using the SAME glob `"../../**/*.ts"`) PASSES all 8 tests per the research. Both test files sit at `convex/productInventory/__tests__/`. The research explicitly notes (RESEARCH.md:368): *"channelSale.test.ts uses the same glob AND passes all 8 tests. The difference: channelSale.test.ts does NOT call t.action(internal.*)"*.

So the glob is NOT the distinguishing factor — the difference is `t.action(internal.*)` vs direct-handler invocation. Changing the glob suffix to `.{ts,tsx}` is unlikely to help and will burn executor iterations before Fix 3/4. The likely-working fix (verified by `tests/convex/productSubstitution.test.ts`) is `"../../convex/**/*.*s"` — which is at a different relative-path depth because that test file lives at `tests/convex/`, not `convex/productInventory/__tests__/`. The corresponding glob from the sibling directory would be `"../../**/*.*s"` or similar.

**Recommendation:**
- Reorder Plan 01's fix hypotheses: put **Fix 4 (direct-handler invocation via `_runFullAuditForTest` export)** first or second, since it's the pattern that's known-green for the entire tests/convex/ directory without touching glob tuning.
- Make Plan 01 explicitly run a diff between `channelSale.test.ts` (green) and `channelAudit.test.ts` (red) as Task 0 — the delta IS the fix surface.
- If glob tuning is attempted, the hypothesis should be `"../../**/*.*s"` (matches productSubstitution shape when path-depth is reconciled), not `.{ts,tsx}`.
- Plan 03/05/07 tests all copy the PLANNED Plan 01 glob `.{ts,tsx}` verbatim. If that glob doesn't work, those plans inherit the bug. Make Plan 01 set the canonical glob first, then Plans 03/05/07 reference "the same glob as channelAudit.test.ts post-Plan-01."

### Issue C2: Plan 06 Convex-constraint caveat is probably incorrect

Plan 06 Task 1 includes this note:
> NOTE: Convex does not allow a public mutation to call `ctx.runMutation` of an internal mutation in the same file. If Convex rejects this pattern, inline the internal handler logic into `runOneChannelBackfillPage`...

This is incorrect. Convex's documented restriction is that a mutation cannot call `ctx.runMutation(api.foo.bar, ...)` on a **public** mutation (which would be RPC-style reentrancy), but it CAN call `ctx.runMutation(internal.foo.bar, ...)` on an `internalMutation` — including one in the same file. This is the exact pattern used by `channelRoutingSeed.ts` (the referenced analog) where `runRoutingSeed` calls `internal.migrations.channelRoutingSeed.seedChannelRoutingFromOutlets` via `ctx.scheduler.runAfter`.

However, `mutation` → `mutation` same-transaction `ctx.runMutation` for INTERNAL targets DOES work in current Convex. The pattern in `convex/externalData/mutations.ts:988, 1025` (`saveRevenueItemsImpl` shared helper) is the cleaner answer — extract a plain async helper function that both the public `mutation` and the `internalMutation` call directly, no `ctx.runMutation` indirection at all.

**Recommendation:**
- Remove the "NOTE: Convex does not allow..." caveat from Plan 06.
- Refactor to the shared-helper pattern: extract `backfillOnePageImpl(ctx, source)` as a plain async function, invoked by both `backfillOnePage` (internalMutation) and `runOneChannelBackfillPage` (admin mutation). This is the `saveRevenueItemsImpl` pattern already used in the codebase.
- This also simplifies Task 1's acceptance criteria (no `ctx.runMutation` call to worry about).

### Issue C3: Plan 04 `by_type` index is compound — document the semantics

`convex/schema.ts:1038` declares `by_type: ["transactionType", "createdAt"]` (compound). The plan's `migrateOnePage` uses `.withIndex("by_type", q => q.eq("transactionType", "gofood_sale")).paginate(...)`. This is valid — partial eq on the first compound field is supported. But the self-heal claim ("re-run on partial completion picks up where it left off") is only true because already-migrated rows are no longer `gofood_sale` and drop out of the index scan — NOT because `.paginate` resumes from a cursor. Passing `cursor: null` on every call (as the test in Plan 05 does) is CORRECT given the self-heal semantics, but the PLAN 04 action body holds `cursor` state across pages within a single action run.

The mismatch: if the action is interrupted mid-page and the NEXT admin trigger starts fresh (cursor null), the new invocation re-queries from the top — which still works because patched rows no longer match the filter. OK, but this should be made explicit because the code *looks* like it relies on cursor continuity when it actually relies on filter narrowing.

**Recommendation:**
- In Plan 04 action handler, add a code comment clarifying: "Cursor continuity is for the single-invocation traversal; cross-invocation idempotency comes from the `by_type` filter narrowing to unmigrated rows only. Re-triggering the admin mutation with cursor=null is safe and is the recovery path on partial failure."
- Plan 05 Test 4 (self-heal) already demonstrates this — good. But the assertion `expect(secondRun.migrated).toBe(0)` uses `paginationOpts: { numItems: 500, cursor: null }` which is the admin-re-trigger path, not the cross-page resumption path. That's correct — the test validates the property that matters.

### Issue C4: Plan 03 seed data schema drift

The `externalRevenue` table in schema requires `dataOrigin` and `confidence` fields (observed via `channelAudit.test.ts:48-50`: `dataOrigin: "api_revenue", confidence: "exact"`). Plan 03's Task 1 seeds:

```typescript
const revenueId = await ctx.db.insert("externalRevenue", {
  source: "shopee",
  externalTransactionId: "shopee-tx-1",
  transactionDate: 1700000000000,
  totalAmount: 100000,
  createdAt: Date.now(),
});
```

This will fail schema validation. The test comment caveats acknowledge "if the `externalRevenue` schema requires additional fields... add the minimum required fields" — but does not PRE-DOCUMENT the missing fields. The executor will hit this on first `t.run` invocation and waste an iteration.

Similar drift risk exists in Plan 05's `seedGofoodSale` helper (`storageLocations`, `menuProducts`, `productInventoryTransactions` minimal fields) and Plan 07's test seeding (`consignmentOutlets`, `consignmentSettlements` require `revSharePercent`, `revShareAmount`, `frolliePayment`, `status`).

**Recommendation:**
- Pre-populate correct required fields in Plan 03 seed (add `dataOrigin: "api_revenue"`, `confidence: "exact"`, and any other fields present on `channelAudit.test.ts` lines 43-51 or `saveRevenueItemsHook.test.ts`).
- Same for Plan 05 / 07 seeds — read actual schema, pre-fill, don't defer discovery to executor.
- Alternative: Plan 01 exports `seedExternalRevenue` and `seedGofoodSale` helpers into `convex/productInventory/__tests__/testFixtures.ts` and downstream plans reuse them.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| I1 | Plan 06 GrabFood card should be disabled with explanatory text, not just auto-empty | Medium | Low |
| I2 | Plan 08 atomicity documentation could be stronger — reword "atomic in same commit" | Medium | Low |
| I3 | Plan 07 Task 2 does not hook `useQuery(api.menuProducts.queries.list)` type-safely | Medium | Low |
| I4 | Plan 02 MAX_ITERATIONS=500 is fine but add a returned warning field | Low | Low |
| I5 | Plan 10 CHANGELOG bundling is correct; Plan 09 runbook on direct-to-main is risky mid-phase | Medium | Medium |
| I6 | Plan 05 Test 2 has a subtle flaw: `as any` cast can mask real bugs | Medium | Low |
| I7 | Plan 08 Path A/B decision for gofoodRegression.test.ts needs pre-commitment | Low | Low |
| I8 | Plan 06 Task 3 button state for per-source `blocking > 0` needs UX review | Low | Low |

### Improvement I1: GrabFood card should visually communicate permanent-OFF

Plan 06 Task 3 ships GrabFood as "a normal card. When admin clicks Backfill, `pending === 0` (no data ingested), card immediately marks 'Completed (0 deducted)'." This is functionally correct but UX-confusing — admin will click it expecting action, get instant success, and wonder if anything happened. The `description` field in `CHANNEL_SOURCES` is set to `"Permanent-OFF until OAuth scope granted"` but that text is only shown once preflight loads.

**Recommendation:** In Plan 06 Task 3, when `source.value === "grabfood"` AND preflight returns 0 pending, render a distinct state: "Awaiting OAuth scope — no items to backfill yet" in muted color, disabled button. This matches D74.5.2-L15 semantics more honestly.

### Improvement I2: Plan 08 atomicity language is loose

Plan 08's CRITICAL callout says:
> D74.5.2-L5 atomicity reminder for execute agent: ALL 4 TASKS must ship in a SINGLE commit on a single feature branch. Do NOT commit Task 1 + Task 2 separately — the intermediate state has a broken build.

This conflates "atomic commit" (single git commit) with "atomic merge" (single PR merge). Git commits on a feature branch don't need to be individually build-green — only the merged-to-main state does. The real constraint is that the PR merge must ship all 4 tasks together; splitting across multiple PRs is the problem.

**Recommendation:** Reword Plan 08 to: "All 4 tasks ship in a SINGLE PR merge. Within the feature branch, you may commit tasks incrementally; individual commits don't need to be build-green. The merge commit must contain all 4 tasks. The atomicity constraint is about what reaches main, not about individual commits."

### Improvement I3: Plan 07 Task 2 type-safety gap

Plan 07 Task 2 suggests:
```typescript
const menuProducts = useQuery(api.menuProducts.queries.list, {}); // OR whatever existing hook name is
```

The "or whatever" is a code smell — the executor will have to grep. More importantly, the Select `onValueChange` handler does:
```typescript
const mp = menuProducts?.find((p) => p._id === v);
```

Using `any` inference on `menuProducts` and `Id<"menuProducts">` casts via string `v` won't type-check cleanly.

**Recommendation:** Plan 07 Task 2 should pre-identify the exact hook name (likely `useMenuProducts()` — grep `src/hooks/convex/` before committing the plan), pre-type the `value` as `Id<"menuProducts">`, and cast explicitly at the `onValueChange` boundary: `handleUpdateItem(item.id, "linkedMenuProductId", v as Id<"menuProducts">)`.

### Improvement I4: Plan 02 runaway protection could be observable

`MAX_ITERATIONS = 500` is correct, but the returned `{ hitCap: boolean }` field isn't consumed by the UI in Plan 06's `useRunChannelBackfill` — the client-loop pattern doesn't use the action's looping behavior at all, only `runOneChannelBackfillPage`. So `hitCap` is only surfaced if admin invokes the internalAction directly via dashboard.

**Recommendation:** Low priority — document in Plan 02 that `hitCap` is a dashboard-diagnostic field, not UI-surfaced. Consider whether to simplify `backfillChannelDeductions` to just be a ceremonial wrapper for scheduler-triggered use, or remove it entirely since the UI drives `runOneChannelBackfillPage` directly.

### Improvement I5: Plan 09 direct-to-main risk during execution

Plan 09 says:
> **Branch:** `feature/74.5.2-runbook` OR direct-to-main (doc-only per CLAUDE.md doc-only rule — the planner recommends direct-to-main for faster landing)

But Plan 09 depends on Plans 02/04/06/07/08 completing first (its frontmatter lists them). If a reader runs Plan 09's runbook before Plan 08 atomic retirement lands, the runbook references features that don't yet exist (the admin UI GoFood card, the hybrid TransactionLogPanel). Direct-to-main for an incomplete doc is worse than branch-coordinated.

**Recommendation:** Plan 09 should use a feature branch coordinated with Plan 10 (both can merge together). The "doc-only" rule in CLAUDE.md is for doc commits that are truly self-contained; cross-referencing in-flight code is not that.

### Improvement I6: Plan 05 Test 2 `as any` cast weakens the guard

Plan 05 Test 2 asserts `source: "gobiz"` was written, then:
```typescript
const gofoodSourced = rows.filter((r) => (r.source as any) === "gofood");
expect(gofoodSourced.length).toBe(0);
```

The `as any` cast strips the type-check. Since TypeScript already refuses to compile `"gofood"` (not in the union), this runtime check is redundant AND the `as any` cast suggests it's verifying something the type system proves. If schema drift later adds "gofood" to the union, this test continues to pass silently.

**Recommendation:** Remove the `as any` cast and the filter — rely on compile-time enforcement. Keep ONLY `expect(rows[0].source).toBe("gobiz")`. Add a comment: "Type system refuses `source: 'gofood'` at compile time; this runtime check would require a bypass that shouldn't exist."

### Improvement I7: Plan 08 Path A/B pre-commitment

Plan 08 Task 3 lets the executor choose Path A (update test) or Path B (delete test) at execution time. This is a reasonable planner-discretion call, but it's reversible with real consequences: if Path B is chosen and `saveRevenueItemsHook.test.ts` doesn't actually cover GoFood end-to-end, the regression test is lost.

**Recommendation:** Plan 08 Task 3 should mandate a PRE-CHECK: grep `convex/externalData/__tests__/saveRevenueItemsHook.test.ts` for `"gobiz"` or `gofood` — if 0 matches, Path B is forbidden (the coverage is not there). If 1+ matches, either path is OK. This turns the decision into a deterministic one-liner.

### Improvement I8: Plan 06 Task 3 `blocking > 0` UX

Plan 06 Task 3 is explicit that per-source audit blocking issues are informational (button stays clickable). Good. But the rendering `{blocking > 0 && (<div className="text-yellow-600 ...">⚠ {blocking} blocking audit issue(s)...</div>)}` makes the warning disappear instantly once admin resolves the last issue. No "you just cleared the block" signal.

**Recommendation:** Low priority. Plan 09 runbook already documents the workflow. Leave as-is unless users complain post-launch.

---

## 4. Refinements (Minor Suggestions)

- Plan 02 comment about `channelDeductionEnabled` "gofood" vs "gobiz" at line 1049 of schema.ts is pre-existing — no plan change, but worth noting that the schema comment already calls this out. Plan 09 runbook should mirror the exact schema comment language for consistency.
- Plan 06 `CHANNEL_SOURCES` label "GoFood" with `value: "gobiz"` is correct but the 6-card ordering (alphabetical) puts GrabFood before GoFood — fine for rendering but the runbook cutover order (Shopee → TikTok → BigSeller → K3Mart → GoFood) doesn't match. Consider reordering cards to match runbook order for workflow ergonomics.
- Plan 03 Test 3 comment: `// CRITICAL: inventoryDeductedAt must still be undefined so admin can re-attempt after mapping.` — add "(Pitfall 3)" in-line so the cross-reference is visible in vitest output when test names print.
- Plan 07 Task 3's `SettlementItemsBreakdown` uses `items: any[]` inside the map (`items.map((item: any) => ...)`). Type as `Doc<"externalRevenueItems"> & { menuProduct: Doc<"menuProducts"> | null }` for stronger guarantees.
- Plan 09 Troubleshooting Q: `"I'm writing source: 'gofood' in a new file — why fails type-check?"` — consider rephrasing as a positive tip: "When writing GoFood code, always use `source: 'gobiz'` (the externalSource union literal)."
- Plan 10 CHANGELOG entry's "Deferred (follow-up phase)" section is great — consider adding "See 74.5.3 TBD for schema drops" as a forward-ref link.
- Plan 05 seed helper `seedGofoodSale` uses `quantity: -(opts.quantity ?? 1)` — sign flip is baked in, good. But `previousQuantity: 10, newQuantity: 10 - (opts.quantity ?? 1)` is a fixed pre-state that might not match real rows. Fine for test fixture purposes; document that these are fabricated.
- All plans use `grep -c` acceptance criteria. Consider adding one or two `grep -l` (list files) checks where the plan wants to ensure a pattern is NOT present anywhere in a directory (Plan 08's `grep -rn "processGofoodSales" convex/ src/` returns 0 is the right shape here; good).

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `saveRevenueItemsImpl` shared-helper pattern | `convex/externalData/mutations.ts:804` | Plan 06 should use this pattern (extract `backfillOnePageImpl` helper) instead of `ctx.runMutation` indirection |
| `channelRoutingSeed.ts` internalAction loop + admin-trigger | `convex/migrations/channelRoutingSeed.ts` | Already the explicit analog for Plan 02 and Plan 04. Good. |
| `useK3MartBackfillStats` + `useDirectBackfillStats` hook shape | `src/hooks/convex/useUnlinkedBackfill.ts` | Plan 06 Task 2 copies this shape — verify `useAuth` path (`@/contexts/AuthContext`) matches |
| `processChannelSaleInternal` with `event.occurredAt` | `convex/productInventory/channelSale.ts:154-157` | Plan 02 depends on `buildEventFromRow` emitting correct `occurredAt`. Already validated by 74.5.1 tests. |
| `ProductionComponentsSection.tsx` dynamic-row pattern | `src/components/menuProducts/` | Plan 07 Task 2 references correctly |
| `AuditIssueTypeMeta.ts` extraction | `src/components/channelIntegration/` | Plan 10 Task 1 may only need to verify this is already present |
| `channelRoutingSeed.ts` docstring + structure | `convex/migrations/channelRoutingSeed.ts` | Plan 04 mirrors this verbatim |

### Potential Duplication Risks

- Plan 06 creates a new `ChannelBackfillCard` sub-component inline. If the file grows, consider extracting to `src/components/channelIntegration/ChannelBackfillCard.tsx` (co-located with existing channel-integration components). Not required for this phase.
- Plan 07's `SettlementItemsBreakdown` sub-component sits inside `OutletCard.tsx` — if SettlementTimeline.tsx exists, the plan says to edit that file instead. Decision point at execution time. No duplication risk as long as the sub-component is defined once.
- Plan 02's `getChannelBackfillPreflight` queries `channelAuditIssues` via `by_source_open` index — verified `by_source_open: ["source", "resolvedAt"]` exists at schema.ts:2349. Good. Plan explicitly falls back to `.filter()` if index missing; index IS present, so fallback is dead code but harmless.

---

## 6. Phase/Wave Accuracy

| Wave | Plans | Assessment | Notes |
|------|-------|------------|-------|
| Wave 0 | 01 | Good | Test-infra fix first is correct per D74.5.2-L1 |
| Wave 1 | 02, 03 | Good | Schema + action in 02, tests in 03; 03 depends on 02 |
| Wave 2 | 04, 05 | Good | Migration action + tests; 05 depends on 04 |
| Wave 3 | 06, 07 | Good | Admin UI + consignment UI; both depend on 02 (preflight query) or 01 (test baseline); can run parallel |
| Wave 4 | 08 | Good | Atomic retirement; depends on 02-07 correctly |
| Wave 5 | 09, 10 | Needs Adjustment | See I5 — Plan 09 should not be direct-to-main |

**Ordering is correct overall.** Plan 08's position as Wave 4 (after all data-repair tooling is green) is exactly right. Plan 08's deletion of `processGofoodSales` cannot happen until backfill exists (Plan 02) and migration exists (Plan 04), because the admin recovery path post-atomic-flip REQUIRES backfill to re-run. If Plan 08 shipped first, the under-deduction window would be unrecoverable.

**Missing waves:** None. The 5-wave decomposition is complete.

**Dependency graph validation:**
- Plan 08 frontmatter lists `depends_on: [74.5.2-02, 74.5.2-03, 74.5.2-04, 74.5.2-05, 74.5.2-06, 74.5.2-07]` — correct (6 predecessors)
- Plan 10 frontmatter lists all 9 predecessors — correct
- Plan 09 frontmatter lists Plans 02/04/06/07/08 — correct (it documents their surfaces)

---

## 7. Specialist Agent Recommendations

| Plan | Recommended Agent | Rationale |
|------|-------------------|-----------|
| 01 | `tdd-test-architect` | Test-infra diagnosis requires vitest/convex-test expertise; backup: `code-auditor` for the `as any` cast review |
| 02 | `convex-backend` | Schema index + internalAction + internalMutation + admin mutation — all Convex patterns |
| 03 | `tdd-test-architect` | TDD test suite with idempotency + timestamp + admin-gate properties; requires deep convex-test knowledge |
| 04 | `convex-backend` | Migration action + pagination + externalSource literal compliance |
| 05 | `tdd-test-architect` | Migration test suite with self-heal property testing |
| 06 | `react-ui-builder` + `convex-backend` (for Task 1) | Task 1 is backend (loop-page mutation); Tasks 2-3 are frontend (hooks + admin UI extension) |
| 07 | `react-ui-builder` + `convex-backend` (for Task 1) | Task 1 is backend (getSettlementItems); Tasks 2-3 are frontend (form + breakdown UI) |
| 08 | `refactor-architect` | Atomic multi-file deletion requires careful dependency analysis |
| 09 | `cto-orchestrator` | Runbook drafting — cross-cutting operational doc requires system-level thinking |
| 10 | `code-auditor` | Lint polish + doc updates across 4 files; code-auditor catches missed references |

---

## 8. Git Workflow Assessment

### Branch Strategy

| Assessment | Status |
|------------|--------|
| Feature branch specified | ✅ Yes (each plan names a branch) |
| Branch naming convention | ✅ Correct (`feature/74.5.2-{slug}`) |
| Merge strategy documented | ⚠️ Implicit — assumes single-PR-per-plan-or-wave |

### Commit Strategy

Each plan declares its own `feature/74.5.2-{slug}` branch. This is an unusual arrangement for a 10-plan phase — typically a phase is one branch with one PR. The per-plan branching risks merge conflicts (Plan 02 + Plan 06 both touch `convex/productInventory/backfill.ts`; Plan 06 adds a new export to a file Plan 02 creates). Coordinating 10 branches through main-merge in 5 waves is operationally complex.

**Recommendation:**
- Either consolidate to `feature/74.5.2-main` single branch (all plans stack commits), OR
- Explicitly document wave-level merge coordination: "Plans in the same wave merge together to main; downstream waves branch from post-merge main."

Plan 03's note "can merge together with Plan 02 branch if branches coordinate" is the only place this is acknowledged. Make it explicit across all plans.

### Pre-Push Verification

Every plan includes `npm run type-check`, `npm run build`, and relevant test commands. ✅

### CI/CD Considerations

| Concern | Assessment |
|---------|------------|
| Rollback strategy | ✅ Documented — Plan 09 § Rollback, 4 cases |
| Deployment order | ✅ Correct — Wave 0 test fix → backfill infra → migration → UI → atomic retirement → docs |
| Data backup needed | ⚠️ Not discussed — Plan 04 migration patches `productInventoryTransactions`. Convex auto-backs-up, but a `npx convex export` before migration is a cheap insurance step. Recommend adding to Plan 09 runbook. |
| Migration safety | ✅ Safe — Plan 04 migration is forward-only, self-healing, paginated |

### Git Workflow Issues Found

- Plan 09's "direct-to-main OR feature branch" ambiguity — pick one (I5).
- No plan explicitly states that Plan 08's PR requires code review before merge despite the destructive nature. Plan 08 says "Human-verify required — checker reviews the retirement diff before merge" which is good; make it stronger: "PR must have `/gsd-code-review` + at least one human approval before merge."

---

## 9. Documentation Checkpoints

| Plan | Documentation Update Required |
|------|-------------------------------|
| 01 | None (test-infra only) |
| 02 | Deferred to Plan 10 ✅ |
| 03 | None (test-only) ✅ |
| 04 | Deferred to Plan 10 ✅ |
| 05 | None (test-only) ✅ |
| 06 | Deferred to Plan 10 ✅ |
| 07 | Deferred to Plan 10 ✅ |
| 08 | Deferred to Plan 10 + Plan 09 runbook ✅ |
| 09 | docs/CHANNEL_INTEGRATION.md (creates) ✅ |
| 10 | CHANGELOG, SCHEMA, API_REFERENCE, ROADMAP ✅ |

Bundling docs in Plan 10 is appropriate. CHANGELOG covers all shipped items with Added/Changed/Removed/Fixed/Deferred/Operational notes sections. SCHEMA.md update is minimal (index note + migration note). API_REFERENCE.md adds 3 new entries. ROADMAP marks 74.5.2 complete.

### CHANGELOG.md Entry (Draft via Plan 10)

Looks complete. Minor suggestion: Plan 10's `### Deferred (follow-up phase)` section should reference the exact follow-up phase number if known (currently says "74.5.3 TBD"; if 74.5.3 is planned, link; if not, say "decimal follow-up phase TBD").

---

## 10. Testing Plan Assessment

**Overall Testing Verdict: Adequate**

### Planned Tests

| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | `backfillOnePage`/`runChannelBackfill` idempotency, admin gate, timestamp preservation, null-menuProduct skip | convex-test integration | Planned (Plan 03) |
| Backend | `migrateGofoodSaleToChannelSale` chunking, self-heal, source="gobiz", gofoodOrderRef preservation, admin gate | convex-test integration | Planned (Plan 05) |
| Backend | `getSettlementItems` admin gate, enrichment, empty-state | convex-test integration | Planned (Plan 07 Task 1) |
| Backend | `channelAudit.test.ts` 4 failing tests fixed | convex-test integration | Planned (Plan 01) |
| Backend | `processGofoodSales` regression test updated or deleted | convex-test integration | Planned (Plan 08 Task 3) |
| Frontend | `SettlementFormDialog` item-row sum validation | Manual per VALIDATION.md | Deferred to planner discretion |
| Frontend | `UnlinkedProductsBackfill` per-source cards rendering | Manual per VALIDATION.md | Deferred |

### Missing Test Coverage (Recommend adding)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | Plan 06 Task 2: `useRunChannelBackfill` hook client-loop termination on `itemsProcessed===0` | Loop exit condition bug = infinite UI spinner | Component test with mocked mutation returning `{itemsProcessed: 0}` on 2nd call |
| 2 | Plan 07 Task 2: `SettlementFormDialog` sum-mismatch client-side guard | UX — prevents bad submissions | `@testing-library/react` test that fills 3 items summing to mismatch, clicks submit, expects toast error + no mutation call |
| 3 | Plan 08 Task 4: `TransactionLogPanel` hybrid rendering for both `gofood_sale` and `channel_sale+gobiz` rows | Both legacy and migrated display identically | Snapshot test OR rendering test that feeds both shapes and expects same DOM |
| 4 | Plan 02 preflight query with 5001+ pending items (exceeds PREFLIGHT_CAP=5000) | UI should display "5000+" not "5000" | convex-test that seeds 5001 items, calls preflight, expects pendingItems === 5000 (or a flag indicating cap hit) |

### Test Execution Checkpoints

Each plan ends with `npm run test -- --run` (appropriate). Full-suite gate is per-wave. ✅

### Regression Risk

- `channelSale.test.ts` — should stay green after Plan 01 glob fix. Plan 01 acceptance criteria include `npm run test -- --run` full suite.
- `saveRevenueItemsHook.test.ts` — may break if Plan 08's `processGofoodSales` deletion leaves dangling references. Plan 08 Task 3 explicitly considers this (Path A/B decision).
- `TransactionLogPanel` visual regression — snapshot test would catch this; plan does not include one.
- `gofoodRegression.test.ts` — Path A/B decision in Plan 08 is the regression-risk mitigation.

---

## 11. Edge Cases to Address

The plans should explicitly handle:

- [x] Pitfall 1: `source: "gobiz"` not `"gofood"` — called out in 3+ plans, enforced by type-check
- [x] Pitfall 2: GoFood atomic flip-and-retire with under-deduction window — Plan 08 + Plan 09 runbook
- [x] Pitfall 3: Backfill must only patch `inventoryDeductedAt` on `result.deducted===true` — Plan 02 + Plan 03 test
- [x] Pitfall 4: Per-source audit gate (not global) — Plan 02 preflight + Plan 06 UI
- [x] Pitfall 5: `collapseRevenuePeriod` untouchability — Plan 07 explicitly avoids write path
- [x] Idempotency: Plan 02 backfill, Plan 04 migration both self-heal
- [x] Admin-only gating: every new mutation uses `requireRole(ctx, token, ["admin"])`
- [x] Pre-74.5.1 consignment settlements empty-state — Plan 07 Task 3 empty-state copy
- [x] GrabFood permanent-OFF (D74.5.2-L15) — Plan 06 ships card with no-op click
- [x] Migration self-heal on interrupted run — Plan 04 `by_type` filter narrows; Plan 05 Test 4 proves
- [x] Backfill skipped items NOT patched (preserves retry window) — Plan 02 + Plan 03 Test 3
- [ ] **Plan 06 GrabFood UX** (see I1) — auto-success may confuse admin
- [ ] **Plan 08 atomicity wording** (see I2) — "atomic commit" vs "atomic PR merge"
- [ ] **Plan 09 backup step** — recommend `npx convex export` before Plan 04 migration runs
- [ ] **`externalRevenue` items backfilled from `source="bigseller"` with zero qty** — Pitfall 3 only covers null-menuProduct; zero-qty is a second skip condition in `processChannelSaleInternal` (see channelSale.ts:138 `zero_quantity`). Plan 03 does NOT test this case. Recommend adding Test 3b: zero-qty item → skipped, no `inventoryDeductedAt` patch, same invariant.
- [ ] **Concurrent admin triggering backfill twice** — `runChannelBackfill` schedules via `ctx.scheduler.runAfter(0, ...)`. Two admin clicks = two scheduled actions = two concurrent `backfillOnePage` loops competing for the same items. The `by_source_deductedAt` index narrows to undefined — if both actions see the same row pre-patch, only one will succeed (patch operation is atomic), the other will see `result.deducted === false` (because stock was already deducted or the row patched). Current plan is probably safe due to the sequential `await ctx.db.patch` per row, but this is not explicitly tested. Acceptable risk; document in Plan 09.

---

## 12. Approval Conditions

**For Approval, address:**
1. **C1** — Plan 01 fix hypothesis ordering (Fix 4 first, or Task 0 diff between known-green channelSale.test.ts and red channelAudit.test.ts)
2. **C2** — Plan 06 Task 1 remove incorrect Convex caveat; use shared-helper pattern instead of `ctx.runMutation` indirection
3. **C3** — Plan 04 add self-heal comment clarifying cursor vs filter-based idempotency
4. **C4** — Plan 03/05/07 pre-populate correct `externalRevenue`/`externalRevenueItems` required fields (`dataOrigin`, `confidence`) in seed data

**Recommended before implementation:**
1. **I1** — GrabFood card disabled state with explanatory text
2. **I2** — Plan 08 "atomic PR merge" wording
3. **I3** — Plan 07 Task 2 pre-identify menu products hook name
4. **I5** — Plan 09 feature branch (not direct-to-main)
5. **I6** — Plan 05 Test 2 remove `as any` cast
6. **I7** — Plan 08 Path A/B pre-check rule

**Plan structure compliance:**
- ✅ All 10 plans have Git Workflow section with branch + checkpoints
- ✅ All 10 plans have Implementation Waves with PARALLEL/SEQUENTIAL markers
- ✅ All 10 plans have Documentation Updates section (most defer to Plan 10 correctly)
- ✅ All 10 plans have Success Criteria with type-check + build requirements
- ✅ CLAUDE.md 4-section requirement met across all 10 plans

**Phase-specific compliance:**
- ✅ D-05 triple-review mandated (CONTEXT) — this review satisfies the staff-review portion; external AI review still required per `/gsd-review --phase 74.5.2 --all`
- ✅ Pitfall 1 landmine guards present in Plans 02/04/05/06/10
- ✅ Pitfall 5 `collapseRevenuePeriod` untouchability: Plan 07 explicitly only reads `linkedRevenueId`, never writes to consignment mutations
- ✅ Dependency chain Plans 02→06, 04→05, 02→03 correctly declared
- ✅ Plan 08 depends on 2-7 correctly
- ✅ Deferred scope (D74.5.2-L6 schema drop, D74.5.2-L8 flag field drop) respected — no plan silently drops either

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
*Review span: 10 plans, ~3944 LOC total plan content, Phase 74.5.2 unified deduct cutover*
