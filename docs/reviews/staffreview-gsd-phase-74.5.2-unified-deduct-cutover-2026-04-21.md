# Staff Review: Phase 74.5.2 — Unified Deduct Cutover (Post-Execution)

**Date:** 2026-04-21
**Branch:** `gsd/phase-74.5.2-unified-deduct-cutover`
**Base commit:** `1e0454138`
**Head commit:** `6cdcc8bc`
**Plans reviewed:** 74.5.2-01 through 74.5.2-10 (all 10 SUMMARYs)
**Reviewer role:** Senior engineer, plan-to-implementation fidelity + architectural risk

---

## 1. Summary

**Overall Assessment: Approved with Minor Concerns**

Phase 74.5.2 is a high-quality behavioral cutover phase. All 10 plans executed to completion. The core objectives were delivered: `processGofoodSales` is fully retired (grep returns 0), the `by_source_deductedAt` compound index is in schema, 6 per-source backfill buttons are wired to a real admin UI, the consignment per-product breakdown is live, and `docs/CHANNEL_INTEGRATION.md` is written. The pre-execution staff review issued 4 Critical and 6+ Improvement findings; the SUMMARYs confirm all 4 Criticals were resolved during execution (C1: Hypothesis 1 direct-handler beat the globe; C2: `backfillOnePageImpl` shared-helper pattern landed correctly; C3: self-heal comment added to migration; C4: seed-data corrected in all three test plans).

The architectural pattern established here — direct-handler `_fooForTest` test-shim exports as the standard workaround for convex-test's `actionFromPath` module-resolver bug — is now consistent across four files (`channelAudit.ts`, `backfill.ts`, `gofoodSaleToChannelSale.ts`, `consignment/queries.ts`). This is a project-wide pattern that needs documentation and eventual root-cause resolution.

Material risks remaining: the sticker auto-deduction functional gap (Phase C of gobiz adapter deleted, leaving sticker inventory untracked post-cutover), a lurking dual-entry risk in the test-shim approach if `_fooForTest` bodies diverge from registered handlers over time, and the `gofood_sale` literal soak period creating a permanent UI hybrid that will be confusing until 74.5.3 lands.

---

## 2. Critical Issues

### C1 — Sticker auto-deduction functional gap is documented but not risk-rated

**Location:** Plan 08 `convex/integrations/gobiz/adapter.ts` (Phase C deletion), Plan 09 Known Gaps

**Finding:** Phase C of the gobiz adapter (`processSyncSales` for sticker dedup) was deleted alongside Phase D (`processGofoodSales`). The RESEARCH and Plan 08 SUMMARY acknowledge this explicitly. The Plan 09 runbook documents it under "Known gaps and follow-ups" as a follow-up candidate. However, the operational implication is concrete and currently unmitigated: every GoFood sale since the GoFood flag flip produces no sticker inventory deduction. Sticker stock figures are silently incorrect from the moment `channelDeductionEnabled.gobiz` is set to `true` post-deploy.

The SUMMARY states: "admins must either (a) manually record sticker consumption in the inventory adjust flow, or (b) extend `processChannelSaleInternal` / a sibling hook to BOM-resolve packaging components." Neither option exists today. Option (a) is operationally infeasible at GoFood volume. Option (b) is deferred to 74.5.3+ without a concrete plan.

**Risk:** MEDIUM-HIGH. Sticker counts are inventory data used for procurement and production planning. Silent under-deduction accumulates until corrected. The longer the soak without 74.5.3, the larger the gap.

**Recommendation:** Before flipping `channelDeductionEnabled.gobiz` ON, the team should decide: either (a) file an explicit 74.5.3 ticket scoped to BOM-aware packaging deduction and set a concrete timeline, or (b) add a manual sticker-count correction workflow to the runbook with frequency guidance. The current runbook mentions the gap but does not tell the admin what to do about it operationally.

### C2 — `_fooForTest` shims in production files are now a project-wide pattern without a sunset plan

**Location:** `convex/productInventory/channelAudit.ts`, `convex/productInventory/backfill.ts`, `convex/migrations/gofoodSaleToChannelSale.ts`, `convex/consignment/queries.ts`

**Finding:** Four production Convex files now export `_fooForTest` functions that duplicate the registered handler logic verbatim. This approach was introduced in Plan 01 as a pragmatic workaround for a convex-test module-resolver bug and has cascaded to every subsequent plan that needed integration tests. The SUMMARYs (Plans 03, 05, 07) each note the same root-cause error message: `Error: Could not find module for: "productInventory/backfill"` / `"migrations/gofoodSaleToChannelSale"` / `"consignment/queries"`.

The structural risk is **handler drift**: when a registered handler body is updated, the `_fooForTest` export must be updated in sync. There is no compile-time enforcement of this invariant. Tests that invoke the shim will pass while tests that invoke the handler directly (if any are written later) would catch a divergence. Currently there are no tests that exercise the registered handlers directly — only the shims.

Additionally, the shims are exported at module scope, meaning they appear in the Convex bundle and are technically reachable from any other Convex function that imports from those files. The JSDoc comment "DO NOT call these from production code" is a convention, not a constraint.

**Recommendation:**
1. File a 74.5.3 or standalone tech-debt ticket to investigate the root cause of the convex-test module-resolver bug. The `tests/convex/productSubstitution.test.ts` reference (which successfully calls `t.action`) with a different glob path depth deserves a proper comparison against the failing pattern. Resolution would eliminate the need for shims.
2. Until resolved, add a lint rule or a CI grep check: `grep -rn "_ForTest" convex/ | grep -v "__tests__" | grep -v "// "` — any match in a non-test file that isn't prefixed with a comment is a signal of an unprotected shim. This would catch if a shim is accidentally called from production code.
3. Add a note to `docs/TESTING_GUIDE.md` documenting the shim pattern and the known bug.

---

## 3. Important Findings

### I1 — Plan 05 tests were shipped in a partial-red state (cross-worktree bridge)

**Location:** `convex/migrations/__tests__/gofoodSaleToChannelSale.test.ts`, Plan 05 SUMMARY

**Finding:** Plan 05 SUMMARY explicitly states: "Test file does NOT run green in this worktree — Plan 04's action file lives in a parallel worktree. Post-merge test gate is the first legitimate run." The Plan 05 SUMMARY also flagged that Plan 04 needed to add `_migrateOnePageForTest`, `_migrateGofoodSaleToChannelSaleForTest`, and `_runGofoodSaleToChannelSaleMigrationForTest` shims — but Plan 04 was already committed in a parallel worktree without them.

The Plan 06 SUMMARY confirms the build was broken at the Plan 04 commit (`4408fab3`) due to TS6133/TS7022 errors. The SUMMARY notes this was "introduced by `4408fab3 fix(74.5.2): add direct-handler test shims to gofoodSaleToChannelSale`" — this means the shims for the migration file were added post-hoc in a fix commit, and those commits appear to be from Plan 06 and Plan 07 (the migration file was patched in both Plan 06 commit `ee4f10af` and Plan 07 commit `47eb8920`).

This cross-wave state means the integration tests for Plan 05 went red for at least one wave before being resolved. The final `npm run test -- --run` in Plan 10 shows 1702 passing / 2 skipped, so the state is green at merge time — but the intermediate broken state was accepted silently.

**Recommendation:** The orchestrator should enforce that parallel worktree agents do not ship test files that depend on shims not yet exported in the target file. Either (a) the test-authoring agent must add the shims to the implementation file as part of its commit, or (b) the test file must be gated to `test.skip` with a `// TODO: un-skip after wave merge` comment until the implementation file is on the same branch.

### I2 — `gofood_sale` literal soak period creates a maintenance burden in `TransactionLogPanel.tsx`

**Location:** `src/components/inventory/TransactionLogPanel.tsx`, Plan 08 SUMMARY

**Finding:** Plan 08 added two helpers (`isGoFoodTransaction`, `resolveDisplayConfig`) plus a client-side filter fallback to bridge the period when both `gofood_sale` (legacy rows) and `channel_sale + source=gobiz` (migrated rows) coexist in the same database. This is architecturally sound for the soak period, but the Plan 08 SUMMARY explicitly defers cleanup to 74.5.3 with this scope:

> "Remove the legacy `gofood_sale` branch from `TransactionLogPanel.tsx` `TX_CONFIG` + `TYPE_FILTERS`. Simplify `isGoFoodTransaction` to only match `channel_sale + source=gobiz`. Remove the client-side filter fallback."

The hybrid display code is correct but fragile — any future developer adding a new transaction type filter might not understand the `isGoFoodTransaction` predicate is a temporary bridge, not a canonical pattern. The `gofood_sale` entries in `TX_CONFIG` and `TYPE_FILTERS` will look like intentional configuration to a future reader.

**Recommendation:** Add a comment block to `TransactionLogPanel.tsx` at the hybrid section: `// SOAK BRIDGE: remove in 74.5.3 after schema literal drop — see Plan 08 SUMMARY §Next Phase Readiness`. This is a small addition that makes the temporary nature explicit without requiring any code change.

### I3 — `depotAutoSeed.ts` retained with zero production callers

**Location:** `convex/productInventory/depotAutoSeed.ts`, Plan 08 SUMMARY

**Finding:** The `ensureDepotLocation` helper in `depotAutoSeed.ts` was retained after `processGofoodSales` (its only caller) was deleted. The Plan 08 SUMMARY says it was kept "for future admin tooling use" with a header docstring flag. However, there is no concrete admin tooling plan that uses it, and the helper's behavior (auto-seed a depot location for an outlet) has been superseded by the admin-configured `channelRouting` approach from 74.5.1.

Additionally, `tests/unit/depotAutoSeed.test.ts` was deleted as a blocking fix (the test directly invoked the retired handler). The retained helper now has zero test coverage.

**Risk:** LOW. Dead code with no test coverage is a maintenance burden.

**Recommendation:** Either (a) delete `depotAutoSeed.ts` in 74.5.3 alongside the `gofood_sale` literal drop, or (b) add a test that covers `ensureDepotLocation` if admin tooling genuinely needs it. The Plan 08 SUMMARY's 74.5.3 cleanup checklist should include this file explicitly.

### I4 — `getChannelBackfillPreflight` blocks on manager role but is admin-only

**Location:** `convex/productInventory/backfill.ts:197-227`

**Finding:** `getChannelBackfillPreflight` uses `requireRole(ctx, args.token, ["admin"])` — admin-only. This is correct per the plan spec ("write-adjacent; don't broaden to manager"). However, the consignment query `getSettlementItems` (Plan 07) uses `["admin", "manager"]`. The asymmetry is intentional per different data sensitivity — good. But the preflight query is a read-only count query, not a write-adjacent operation. Restricting a count query to admin-only means a manager viewing the admin-backfill page would need to request admin access just to see pending counts.

**Recommendation:** Consider broadening `getChannelBackfillPreflight` to `["admin", "manager"]` in a follow-up since it only returns counts (not row data). This is low urgency since the backfill page itself is admin-only, so a manager wouldn't navigate there anyway. Leave as-is if the page access control is enforced at route level.

### I5 — Plan 03/05/07 schema-drift corrections were applied but reveal a systemic planning gap

**Location:** Plan 03, 05, 07 SUMMARYs — all three list identical seed-data corrections

**Finding:** All three test plans required runtime correction of plan-template seed data: `users.pin` → `pinHash`, `menuProducts.sku/recipeId` → `code/grams/defaultPrice/unitCost/cachedProductionSummary`, `storageLocations.code` → absent field, `externalRevenue.confidence` → required field, `channelRouting.tier` → `storageLocationId + isDefault`. This is the exact list predicted by the pre-execution staffreview C4. The corrections were successfully applied by each executor, but at execution-time cost.

The underlying cause is that the PLAN.md templates use simplified pseudo-code seed data that diverges from the actual schema. Every test-authoring plan in this phase had to cross-reference `convex/schema.ts` and `channelSale.test.ts` to build correct fixtures.

**Recommendation:** The `.planning/phases/74.5.2-unified-deduct-cutover/74.5.2-PATTERNS.md` (referenced by plans but not read in this review) should include a "Canonical seed-data helpers" section with copy-pasteable fixtures for the tables most commonly seeded in tests (`users`, `menuProducts`, `storageLocations`, `externalRevenue`, `externalRevenueItems`, `channelRouting`). Future phase plans can then reference these fixtures by name.

---

## 4. Minor Findings

### M1 — `_backfillOnePageForTest` duplicates `backfillOnePageImpl` body verbatim

`backfill.ts` now has three copies of functionally equivalent logic:
1. `backfillOnePageImpl` — shared helper
2. `backfillOnePage` (internalMutation) — delegates to `backfillOnePageImpl`
3. `_backfillOnePageForTest` — copy of `backfillOnePageImpl` body (added in Plan 03 before `backfillOnePageImpl` existed at the shared-helper level)

After Plan 06 extracted `backfillOnePageImpl`, `_backfillOnePageForTest` could be simplified to `return backfillOnePageImpl(ctx, args.source)` — removing the duplication. Currently both bodies exist and must be kept in sync. Low risk since they're identical today, but divergence is possible.

### M2 — `runChannelBackfill` (scheduler path) and `runOneChannelBackfillPage` (UI path) coexist with unclear operational guidance

The runbook (Plan 09) documents the admin UI client-loop path (`runOneChannelBackfillPage`). The scheduler path (`runChannelBackfill` → `backfillChannelDeductions`) is also shipped but the runbook does not document when an admin would prefer it. The `hitCap` field (returned only from `backfillChannelDeductions`) is noted as a "dashboard diagnostic" not surfaced in UI. This creates an undocumented split: the UI path terminates when `itemsProcessed === 0` (correct), the scheduler path terminates when `MAX_ITERATIONS` is reached or exhausted (also correct, but visible only via Convex dashboard logs).

**Recommendation:** Add a FAQ entry to `docs/CHANNEL_INTEGRATION.md`: "When should I use the scheduler path (`runChannelBackfill`) vs the admin UI? Use the admin UI for all normal backfill operations — it shows real-time progress. Use the scheduler path only for large-volume sources (>100K items) where the UI client-loop would take prohibitively long."

### M3 — Plan 08 Wave Wave counting is unclear: Tasks 1+2 were committed atomically but SUMMARY labels them separately

Plan 08 committed Tasks 1+2 in a single commit `c64c6d97` because "the intermediate state has a broken build." This is the correct engineering decision. However, the SUMMARY Wave section still shows "Tasks 1+2 committed atomically (single commit)" while the PLAN frontmatter lists 4 separate tasks. This makes the plan-to-commit tracing harder for a future auditor.

**Recommendation:** No code change needed. Future phases with forced-atomic commits should update the plan frontmatter's `tasks` count to reflect the actual commit count (`tasks: 3` for 3 commits when 2 tasks are collapsed).

### M4 — Migration `gofoodSaleToChannelSale.ts` `triggeredBy` parameter is accepted but unused in handler body

Per Plan 06 deferred-items: the `_args` rename was the fix applied. But the action's `triggeredBy: v.string()` parameter is passed by the scheduler dispatch and stored in Convex function logs, but is not written to any audit trail or log within the handler. The `backfillChannelDeductions` internalAction passes `triggeredBy: user.name` from the admin trigger, but the internalAction body never uses it (only the returned `{totalMigrated, pagesProcessed}`).

**Recommendation:** Either consume `triggeredBy` (log it, write it to a migration-log record), or remove it from the `internalAction` signature. Currently it's a dead parameter with a `_args` rename to silence TypeScript. The `runChannelBackfill` analog passes `triggeredBy: user.name` and the internalAction docstring says "audit trail" but there is no actual audit trail write.

### M5 — `gofoodRegression.test.ts` has 2 `test.skip` placeholders without a clear owner

Plan 08 Path A created placeholder `test.skip` entries in `gofoodRegression.test.ts`: "awaiting post-Plan-09 fixtures in `tests/fixtures/channel-regression/`." This directory does not exist. Plan 09 (runbook) did not create these fixtures. Plan 10 did not reference them. The skipped tests will remain skipped indefinitely without an explicit task.

**Recommendation:** Either (a) convert the `test.skip` entries to `test.todo` with a descriptive message matching the actual missing fixture shape, or (b) delete them and note in a comment that the relevant coverage is in `channelSale.test.ts` and `backfill.test.ts`. `test.skip` with no timeline is a known anti-pattern (CLAUDE.md memory: "E2E tests that silently skip need test.skip — false confidence otherwise").

---

## 5. Architecture Assessment

### 5.1 Plan Fidelity

All 10 plans executed with no material scope creep and no missing deliverables. The key CONTEXT decisions were honored:

| Decision | Status |
|----------|--------|
| D74.5.2-L1: direct-handler test shims (Wave 0 first) | Honored — Plan 01 ships first, established pattern |
| D74.5.2-L4: backfill-before-flip sequence | Honored — admin UI shows warning, runbook is explicit |
| D74.5.2-L5: GoFood atomic retirement | Honored — Plan 08 deletes function + call sites in one commit |
| D74.5.2-L6: strip-before-drop, forward-only migration | Honored — schema literal NOT dropped in 74.5.2 |
| D74.5.2-L7: consignment breakdown UI mandatory | Honored — `getSettlementItems` + form rows + breakdown expand all shipped |
| D74.5.2-L8: flag field removal deferred | Honored — `channelDeductionEnabled` field stays |
| D74.5.2-L9: `docs/CHANNEL_INTEGRATION.md` required | Honored — 459 LOC runbook created in Plan 09 |
| D74.5.2-L13: backfill flag-independent | Honored — `backfillOnePageImpl` does not read `channelDeductionEnabled` |
| D74.5.2-L15: GrabFood permanent-OFF state | Honored — distinct "Awaiting OAuth scope" UI state |

The only decision that was fulfilled differently than planned: D74.5.2-L3 (polish lint items) turned out to be a no-op because 74.5.1 triple-review (`bf036387`) had already fixed both `AuditIssueTypeBadge` react-refresh and `ChannelRoutingManager` useMemo warnings. This was correctly documented as a no-op in the Plan 10 SUMMARY.

### 5.2 Coupling with 74.5.1 Spine

Phase 74.5.2 couples tightly to 74.5.1 infrastructure (channelSale.ts, channelRouting.ts, channelAudit.ts, channelFlags.ts) as intended — it's a behavioral activation layer on top of the 74.5.1 additive spine. The coupling points are clean: backfill calls `processChannelSaleInternal` + `buildEventFromRow` directly; the migration uses `by_type` index already in schema; the consignment UI reads `linkedRevenueId` introduced in 74.5.1.

No regressions in 74.5.1 functionality observed in the test suite (1702 passing, 2 intentional skips).

### 5.3 Real-Time Subscription Load

The new `getChannelBackfillPreflight` query is a real-time subscription (all Convex queries auto-subscribe). The admin page calls it once per source (6 subscriptions). Each subscription queries `externalRevenueItems` with `.take(5000)` and `channelAuditIssues` with `.take(1000)`. These queries are index-bounded and performant, but 6 simultaneous subscriptions from one admin session is non-trivial.

More importantly: `getChannelBackfillPreflight` will rerun after EVERY `externalRevenueItems` write. During backfill execution, the admin page is running the mutation in a client loop while also holding 6 active subscriptions. Each mutation that patches `inventoryDeductedAt` on a row triggers all 6 queries to recompute. This is the expected Convex reactive model but the volume (200 items per page, 6 sources, up to 50K items total) means potentially thousands of subscription reruns during a full backfill.

**Risk:** LOW-MEDIUM. This won't cause data corruption, but may cause visible UI lag on the admin page during backfill. The admin UI page is internal-only so the impact is limited.

**Recommendation:** Add a note to the runbook: "During active backfill, the admin page may be slow to update. This is expected — the preflight counts refresh in near-real-time. For very large sources (>10K items), consider running the backfill during off-hours and refreshing the page after completion rather than watching the live progress counters."

### 5.4 Schema Implications of Strip-Before-Drop

The `gofood_sale` literal is still in the schema union at `convex/schema.ts:1015`. The migration (`gofoodSaleToChannelSale.ts`) rewrites the data; the literal drop is deferred to 74.5.3. During the soak period:

- `productInventory/queries.ts:146` still has a cast that includes `gofood_sale` — this must be updated in 74.5.3
- `TransactionLogPanel.tsx` has the hybrid display code — 74.5.3 cleanup documented
- Any new code written between 74.5.2 and 74.5.3 must not write new `gofood_sale` rows (enforced by the fact that `processGofoodSales` is deleted and no code now writes that literal)

The Plan 04 migration is self-healing — running it before or after the GoFood flag flip is safe. The soak period (72h minimum) is documented in the runbook. The schema-drop follow-up is correctly filed as 74.5.3 scope.

**One gap:** `convex/productInventory/queries.ts:146` — the cast-based filter for user-supplied `transactionType` includes `"gofood_sale"` in the TypeScript cast. This reader must be updated in 74.5.3 to remove the literal from the cast. The Plan 08 SUMMARY mentions this as a 74.5.3 task. It should be in the CHANGELOG "Deferred" section explicitly — checking the Plan 10 SUMMARY, it is listed under "Deferred" as "`gofood_sale` schema literal drop." Adequate.

### 5.5 Cutover Sequence Risks

The documented sequence (backfill → audit → flip → soak per channel, GoFood last with atomic retire) is operationally sound. Two risks not fully resolved:

**Under-deduction window for GoFood (P2, recoverable):** Between Plan 08 deploy-complete and admin's flag flip, new GoFood sales produce no inventory deduction. The backfill-then-re-run recovery path is documented. The runbook correctly says "IMMEDIATELY" with caps. Acceptable per D74.5.2-L5.

**K3Mart bundle flip atomicity (UI only, not enforced):** D74.5.2-L14 requires both `k3mart` and `consignment` flags flipped together. The admin UI ships a visual affordance ("K3Mart bundle flip" button) but the Plan 06 SUMMARY shows `CHANNEL_SOURCES` only has individual source entries, not a bundle action. The composite flip action described in the CONTEXT (`ProductInventorySettings.tsx` "Flip K3Mart (both paths)") is not explicitly mentioned in Plan 06 deliverables. The SUMMARY shows 6 individual cards per `CHANNEL_SOURCES`. If the UI only shows individual source cards with no bundle affordance, the admin must manually click two toggles — creating a window where only one flag is ON.

**Recommendation:** Verify that the admin page for `ProductInventorySettings.tsx` (separate from `UnlinkedProductsBackfill.tsx`) has a visual cue or bundle affordance for K3Mart. If not, add to the runbook a explicit note: "For K3Mart, you MUST flip both the `k3mart` AND `consignment` toggles in the same settings save. Flipping only one leaves half of K3Mart's volume undeducted."

---

## 6. Missing Pieces (Per Original Focus Areas)

### Sticker Auto-Deduction Gap (Plan 08, deferred to 74.5.3)

The `processSyncSales` sticker-deduction Phase C in the gobiz adapter was deleted alongside Phase D. This is a **known functional gap** documented in Plan 08 SUMMARY, Plan 09 runbook, and Plan 10 CHANGELOG. No mitigation tooling exists yet. Admin must manually track sticker consumption for GoFood post-flip.

**Impact timeline:** This gap opens the moment `channelDeductionEnabled.gobiz` is flipped ON. Every day without 74.5.3 BOM-aware packaging deduction is a day of incorrect sticker inventory.

### Flag-Flip Timing Risk (D74.5.2-L5, documented but unguarded)

The GoFood atomic retire ships code that deletes `processGofoodSales`. The admin must flip the flag ON within seconds/minutes of deploy completion. The runbook documents this with "IMMEDIATELY" in caps. However, there is no code-level guard (e.g., a startup check or admin UI warning that says "GoFood flag is OFF but processGofoodSales is no longer deployed").

**Mitigation already present:** The under-deduction window is recoverable via backfill re-run. Double-deduction is impossible since the legacy handler is gone. This risk is ACCEPTABLE but should be noted.

### Rollback Gap for GoFood

The Plan 09 rollback Case D instructs: "Flip ALL flags OFF... For GoFood specifically: `processGofoodSales` is deleted in the atomic flip, so rollback requires a revert commit. Runbook should include the exact revert SHA reference pattern."

The runbook does include `git revert -m 1 <merge-sha>` as the pattern. This is the correct approach. However, a full revert of Plan 08 would also undo the test realignment in `gofoodRegression.test.ts` and the hybrid `TransactionLogPanel` changes, which are beneficial even in a rollback scenario. A cleaner rollback would be a targeted revert of only the function deletion commits (`c64c6d97`), not the test/UI cleanup commits.

**Recommendation:** Plan 09 runbook rollback Case D should specify: "Revert only commit `c64c6d97` (the function-deletion commit), not the entire Plan 08 branch. Test and display updates are safe to retain."

---

## 7. Over-Engineering Assessment

The phase is appropriately scoped. No areas of unnecessary complexity were identified. Specific non-over-engineering notes:

- `runChannelBackfill` (scheduler path) + `runOneChannelBackfillPage` (UI path) coexisting is mildly redundant but both serve legitimate purposes. Not over-engineered.
- The `MAX_ITERATIONS = 500` hard cap on `backfillChannelDeductions` is a correct safety measure. Not over-engineered.
- The `hitCap` observability field is a low-cost addition. Not over-engineered.
- The `_fooForTest` shim pattern is a necessary workaround, not a design choice. Not over-engineered.
- Plan 09's 459-line runbook is appropriately thorough for a behavioral cutover of this complexity. Not over-engineered.

One potential simplification: if `runChannelBackfill` (scheduler-triggered ceremonial wrapper) is never used operationally (the UI path uses `runOneChannelBackfillPage` directly), consider archiving or deprecating it in 74.5.3 to reduce the admin API surface. Low priority.

---

## STAFFREVIEW FINDINGS

### Critical

**C1 — Sticker auto-deduction functional gap opens immediately on GoFood flag flip.** Phase C of gobiz adapter deleted; no BOM-aware packaging deduction replacement exists. Sticker inventory silently incorrect from first flag-ON GoFood sale. Requires explicit 74.5.3 timeline or manual admin workflow before flag flip.

**C2 — `_fooForTest` shim pattern now in 4 production files without handler-drift guard or sunset plan.** Shim bodies must be manually kept in sync with registered handler bodies. No compile-time enforcement. Pattern needs documentation in `TESTING_GUIDE.md`, a lint check, and an active 74.5.3 root-cause ticket.

### Important

**I1 — Plan 05 migration tests were in a partial-red state across at least one wave** due to cross-worktree dependency on `_migrateOnePageForTest` shims that hadn't been committed to the implementation file yet. Final state is green, but intermediate acceptance was silent.

**I2 — `TransactionLogPanel.tsx` hybrid soak bridge lacks explicit expiry markers** making it look like permanent configuration to future readers. Needs `// SOAK BRIDGE: remove in 74.5.3` comment block at the hybrid code sections.

**I3 — K3Mart bundle flip atomicity not verified** — CONTEXT D74.5.2-L14 requires a composite affordance for flipping both `k3mart` + `consignment` flags together, but the backfill admin page's `CHANNEL_SOURCES` shows individual cards. ProductInventorySettings.tsx bundle affordance status is unconfirmed in the SUMMARYs.

**I4 — `depotAutoSeed.ts` retained with zero production callers and zero tests** after the deletion of `tests/unit/depotAutoSeed.test.ts`. Creates dead code that will confuse future developers.

**I5 — `runGofoodSaleToChannelSaleMigration` `triggeredBy` parameter accepted but unwritten to any audit trail**, making the parameter semantically meaningless beyond log decoration.

### Minor

**M1 — `_backfillOnePageForTest` duplicates `backfillOnePageImpl`** — should delegate after Plan 06 extracted the shared helper. One extra maintenance surface.

**M2 — Scheduler path (`runChannelBackfill`) vs UI path (`runOneChannelBackfillPage`) operational guidance missing** from the runbook. When should an admin prefer the scheduler path?

**M3 — `gofoodRegression.test.ts` has 2 `test.skip` placeholders** pointing to a fixture directory (`tests/fixtures/channel-regression/`) that does not exist and has no creation plan. Risk of permanent silent skips.

**M4 — GoFood rollback Case D instructs full Plan 08 branch revert** when a targeted revert of only `c64c6d97` (function-deletion commit) would be safer and preserve the test/UI cleanup.

**M5 — Consignment sticker accounting gap** not mentioned in the consignment breakdown UI (Plan 07). The `SettlementFormDialog` item rows enable capturing consignment product quantities, but there is no packaging/sticker capture analogous to what Phase C provided for GoFood sync. This is in-scope for consignment too.

### Nitpick

- `backfill.ts` `_backfillOnePageForTest` should be simplified to `return backfillOnePageImpl(ctx, args.source)` now that the shared helper exists.
- Plan 04 migration SUMMARY acceptance note about grep count returning 3 vs 1 (documentation matches) sets a confusing precedent for plan-acceptance criteria. Future plans should adjust the criteria to specify "exactly one code-write occurrence" vs "1 match."
- `docs/CHANNEL_INTEGRATION.md` section 7 (Known Gaps) lists 5 gaps but omits the K3Mart bundle-flip UI concern. Consider adding.
- The `74.5.2-VALIDATION.md` frontmatter `nyquist_compliant: false` / `wave_0_complete: false` was never updated post-execution. Should be updated to reflect the completed state.

---

## STAFFREVIEW COMPLETE

**Phase verdict:** Implementation is approved with the noted concerns. The four Critical issues (C1 sticker gap, C2 shim pattern governance) require action before the GoFood flag is flipped in production — specifically C1 needs an explicit 74.5.3 timeline or operational fallback documented in the runbook before the admin proceeds with the atomic GoFood cutover.

**Blocking before GoFood flag flip:** C1 must have a resolution path documented. C2 is architectural governance but does not block the cutover.

**74.5.3 scope confirmed from this review:** schema literal drop (`gofood_sale`), `channelDeductionEnabled` field drop, `depotAutoSeed.ts` deletion, `_fooForTest` shim root-cause investigation, sticker auto-deduction via BOM-aware packaging, `TransactionLogPanel.tsx` hybrid bridge removal, `gofoodRegression.test.ts` placeholder cleanup.
