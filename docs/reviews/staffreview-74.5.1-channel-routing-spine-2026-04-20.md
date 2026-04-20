# Staff Review: Phase 74.5.1 — Channel Routing Spine + Admin UI

**Date:** 2026-04-20
**Plan Package:** `.planning/phases/74.5.1-channel-routing-spine/` (12 plans + SPEC + CONTEXT + UI-SPEC + RESEARCH)
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Execution state:** All 12 plans merged; automated verification PASSED (11/11 roadmap truths); 5 HUMAN-UAT items pending dev-server smoke.

---

## 1. Summary

**Overall Assessment:** **Approve with Refinements**

The plan package is high-quality: 12 focused plans, clear wave grouping with files_modified overlap analysis, explicit locked decisions (D-01..D-10), TDD RED-first wave 0, ship-dark feature-flag contract. Execution revealed several **architectural surprises** (not plan defects) around worktree isolation on Windows, Convex codegen staleness, and TDD test-vs-impl shape drift between Plan 00 and Plan 04. None are blocking but 3 of them should be captured as lessons before the next sub-phase (74.5.2) to prevent recurrence.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| C1 | Plan 00 TDD tests for channelAudit use `{type}` field + direct RegisteredAction calls; Plan 04 impl uses `{issueType}` + internalAction. 7 test failures in `channelAudit.test.ts` | TDD / Test Quality | Plan 00 vs Plan 04 |

### Issue C1: channelAudit.test.ts vs impl shape drift

Plan 00 authored 7 tests for `detectAuditIssuesForItem` + `runFullAudit` assuming a particular API shape (issue objects expose `type`, `runFullAudit` callable as a function taking `triggeredBy`). Plan 04 shipped the impl with `issueType` field + `runFullAudit` as `internalAction` (requiring `ctx.runAction`). The tests are permanently RED until reconciled.

Verifier accepted this as a documented override, but the tests provide ZERO regression protection for audit detection logic today. Before 74.5.2 (cutover), these tests MUST be rewritten against the real impl shape — otherwise a regression in audit detection during cutover will ship unnoticed.

**Recommendation:**
- Open a follow-up plan in 74.5.2 prep (or as a hot-fix plan) to rewrite the 7 tests: `convex/productInventory/__tests__/channelAudit.test.ts` lines 108, 112, 128, 131, 146, 149, 173/189/206/242
- Shape mapping: `issue.type` → `issue.issueType`; `runFullAudit(ctx, args)` → `ctx.runAction(internal.productInventory.channelAudit.runFullAudit, args)`
- Secondary: same class of drift exists in `bigseller/__tests__/normalize.test.ts` (platform literal mismatch, lines 41, 56) — include in same fix pass.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| I1 | Document worktree-base-reset workaround (`checkout + update-ref`) in execute-plan.md | High | Low |
| I2 | Mandate `npx convex codegen` step after any new Convex module in executor flow | High | Low |
| I3 | Plan 06's `saveRevenueItemsWithCounts` stub was a defensive-coding pattern for parallel waves — document it | Medium | Low |
| I4 | Plan 07 agent re-created Wave 1's `_shared/*.ts` files because its worktree base-reset failed silently | High | Medium |
| I5 | Consignment `mutations.ts` items arg is optional for backward compat — add a migration note for 74.5.2 to make it required | Medium | Low |

### Improvement I1: Worktree base-reset workaround

**Observed:** Three agents during execution hit sandbox-blocked `git reset --hard`. Agent 05 correctly fell back to `git checkout {base} -- .` + `git update-ref HEAD {base}`. Agent 07 did NOT use the workaround and silently operated from an older base, re-creating Wave 1's shared types in its worktree. The merge caught the duplicate but was lucky — any content drift would have caused conflict or worse (wrong impl merged).

**Recommendation:** Update `.claude/get-shit-done/workflows/execute-plan.md` `<worktree_branch_check>` block to document the `checkout + update-ref` fallback as the official workaround when `reset --hard` fails. Add a verification step post-reset: `git rev-parse HEAD` must equal the expected base, else fail loud.

### Improvement I2: Mandate Convex codegen after new modules

**Observed:** Plan 04 shipped `channelAudit.ts` + `channelAuditMutations.ts` + `channelFlags.ts` as new Convex modules. Internal references like `internal.productInventory.channelAudit.auditPageQuery` failed type-check because `_generated/api.d.ts` wasn't regenerated. Post-merge type-check gate caught it; orchestrator ran codegen manually.

**Recommendation:** Add explicit step to execute-plan.md TDD gate: "If any new file was added under `convex/**/*.ts` outside `_generated/`, run `npx convex codegen --typecheck disable` before committing the plan." Plan 04 and Plan 09 both hit this; Plan 08 included it but manually. Codify the pattern.

### Improvement I3: Document plan 06's defensive `saveRevenueItemsWithCounts`

**Observed:** Plan 06 added a stub version of `saveRevenueItemsWithCounts` in its isolated worktree because Plan 05 hadn't merged yet. Plan 05 shipped the real version. Merge conflict on `convex/externalData/mutations.ts` was resolved in favor of Plan 05 per agent 06's own explicit recommendation. This pattern is GOOD defensive coding for parallel wave execution.

**Recommendation:** Add a section to `docs/CODE_STYLE.md` or a new `docs/patterns/parallel-wave-execution.md` documenting the "stub-now, real-later" pattern with explicit merge-resolution guidance. Agents spawning in parallel need to know how to bridge missing symbols from sibling plans.

### Improvement I4: Agent 07's worktree base drift — root cause

**Observed:** Agent 07 reported "Wave 1 Plan 02 shared types not yet in this parallel worktree; inlined verbatim from Plan 02 action block to unblock execution." This means its worktree was NOT at the expected `fd824cb0` base (post-Wave-1) but at an older state. Merge caught it but only because the inlined content was byte-identical — had it drifted, we'd have silently merged a stale version.

**Recommendation:** Make the worktree base verification a **hard fail** not a "try to reset." If base doesn't match, agent MUST abort and report — orchestrator dispatches a fresh worktree. Current pattern of "try to reset, proceed if it fails" is a time bomb.

### Improvement I5: Consignment items optional arg

**Observed:** `convex/consignment/mutations.ts` `createSettlement` accepts `items` as optional to preserve backward compat. Existing callers pass no items; new callers pass per-line items through the spine. This is correct for 74.5.1 ship-dark.

**Recommendation:** Add to 74.5.2 backlog: tighten `items` to required after all callers are migrated. Add a TODO comment at the optional declaration site referencing the 74.5.2 tightening plan.

---

## 4. Refinements (Minor Suggestions)

- **R1:** `src/components/channelIntegration/AuditIssueTypeBadge.tsx` — react-refresh lint warning because it exports both a component and `getAuditIssueTypeMeta` helper. Extract meta to `AuditIssueTypeMeta.ts`.
- **R2:** `src/pages/ChannelRoutingManager.tsx:144` — useMemo dep warning on `rulesSafe`. Wrap in its own useMemo to stabilize reference.
- **R3:** `convex/productInventory/__tests__/channelSale.test.ts:52` — `seedOutlet` helper defined but unused. Prefix `_seedOutlet` or delete.
- **R4:** `convex/productInventory/channelAudit.ts` — added `AuditPage` type annotation works but consider adding explicit return type to `auditPageQuery` so it's reusable elsewhere.
- **R5:** Plan 11 CHANGELOG entry is very detailed (77 lines). Consider trimming to ~30 lines for release notes style; move the deep technical details into a linked doc.
- **R6:** All 12 plan SUMMARY.md files explicitly flagged their deviations — this is excellent discipline. Add a template note to `.claude/get-shit-done/templates/summary.md` calling this out as the expected pattern.

---

## 5. Duplication Analysis

### Existing Code Leveraged (Correctly)

| Existing Code | Location | How Used |
|---------------|----------|----------|
| `resolveSubstitutionPlan` | `convex/productInventory/substitution.ts` | Plan 04 `channelSale.ts` reuses verbatim per SPEC Constraint 1 — no re-implementation of BOM substitution |
| `createStockTracker` | `convex/productInventory/stockTracker.ts` | Plan 04 reuses verbatim — deduction tracking is centralized |
| `collapseRevenuePeriod` | `convex/lib/periodRange.ts` | Plan 07 consignment mutation reuses per D-07 — no hand-rolled date collapse |
| `requireRole` | `convex/lib/auth.ts` | Every admin mutation gated (routing CRUD, audit resolution, flag set) |
| `externalSource` validator | `convex/schema.ts` | Plan 03 imports from schema (correct per project convention; Plan 03 SUMMARY flagged this as deviation from plan template but it's the right call) |
| `ProtectedRoute` + `allowedRoles` | `src/components/` | Plans 09, 10 gate `/admin/channel-routing`, `/admin/product-inventory-settings`, `/admin/channel-audit` |
| `SourceBadge` (Plan 09 output) | `src/components/channelIntegration/` | Plan 10 reused it in ChannelAuditWorkbench — good handoff |

### Potential Duplication Risks

- `ChannelAuditWorkbench.tsx` (799 LOC) and `ChannelRoutingManager.tsx` (669 LOC) both have admin table + action dialog patterns. Consider extracting a shared `<AdminTablePage>` abstraction in 74.5.2 if ProductInventorySettings or audit resolution UI grow.
- `useChannelRouting.ts` and `useChannelAudit.ts` follow same hook pattern but duplicate boilerplate. Tolerable at 2 hooks; extract if a 3rd similar admin hook lands.

---

## 6. Phase/Wave Accuracy

| Wave | Plans | Assessment | Notes |
|------|-------|------------|-------|
| 1 | 00, 01, 02, 03, 04 | ✅ Correctly grouped | No file_modified overlaps; TDD-first with plan 00 |
| 2 | 05, 06, 07, 08 | ✅ Correctly grouped | No overlaps; plan 05+06 had *intentional* same-file additive pattern (saveRevenueItemsWithCounts) |
| 3 | 09, 10 | ⚠️ `src/App.tsx` overlap | Correctly detected at runtime and forced sequential execution. Plan grouping allowed both but orchestrator's overlap check caught it. |
| 4 | 11 | ✅ Final checkpoint | Correctly autonomous=false; human-verify gate |

**Ordering Issues:** None. Wave 3 overlap was caught automatically by the orchestrator's files_modified pairwise check.

**Missing Phases:** None.

---

## 7. Specialist Agent Recommendations

| Phase/Plan | Recommended Agent | Rationale |
|------------|-------------------|-----------|
| 00-wave0-tests | `tdd-test-architect` | Test scaffolds (unit + E2E + fixtures) — this is its wheelhouse |
| 01-schema | `schema-architect` | Schema additions (3 tables + indexes) warrant review before landing |
| 03-05, 08 | `convex-backend` | Pure backend — queries, mutations, indexes |
| 06-07 | `convex-backend` + `refactor-architect` | Adapter refactors touch multiple existing files |
| 09-10 | `react-ui-builder` | Pages + hooks + shared components |
| 11 | `tdd-test-architect` + orchestrator | E2E un-skip + verification battery |

(All plans were executed via `gsd-executor` which delegates correctly.)

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | ✅ `feature/74.5.1-channel-routing-spine` |
| Branch naming convention | ⚠️ Plan templates specified `gsd/phase-74.5.1-channel-routing-spine` per GSD config but CLAUDE.md rule requires `feature/{slug}`. Executor followed CLAUDE.md. Inconsistency flagged but correct outcome. |
| Merge strategy documented | ✅ CLAUDE.md: squash-merge feature → main via PR |

### Commit Strategy
64 commits across 4 waves. Atomic per-task commits within each plan's worktree; 5 merge commits (one per worktree + 1 for Wave 2 conflict resolution); 6 orchestrator tracking commits. Healthy.

### Pre-Push Verification
- ✅ Plan includes `npm run build` check (Plan 11 must_haves + Wave 1 post-merge gate ran)
- ✅ Plan includes `npm run type-check` verification
- ✅ Local testing ran before declaring complete

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | ⚠️ Not explicitly documented in plans. Ship-dark contract (D-10) is the de-facto rollback: set all flags OFF = original behavior. Worth calling out. |
| Deployment order | ✅ Convex schema auto-push via `npx convex dev`/`deploy`. No manual migration ordering needed. |
| Data backup needed | ⚠️ Plan 01 schema adds 3 tables (zero data loss risk — purely additive). But `npx convex export` as a pre-deploy snapshot is CLAUDE.md best practice. |
| Migration safety | ✅ All schema changes additive; `gofood_sale` literal preserved; no existing field removed |

### Git Workflow Issues Found
- Plan templates specified `gsd/phase-{phase}-{slug}` branch pattern; CLAUDE.md mandates `feature/{slug}`. Orchestrator honored CLAUDE.md (higher precedence). Update `.planning/config.json` to match.
- `git branch -D` is hook-denied — dangling worktree branches accumulated during execution. Non-blocking but worth cleanup pass.

---

## 9. Documentation Checkpoints

| Doc | Status |
|-----|--------|
| `docs/CHANGELOG.md` | ✅ Updated by Plan 11 — comprehensive 77-line entry |
| `docs/SCHEMA.md` | ⚠️ Not updated. Plan 01 added 3 tables + indexes. MUST update before merge. |
| `docs/API_REFERENCE.md` | ⚠️ Not updated. Plans 03-07 added many new Convex mutations/queries. Update before merge. |
| `docs/ROADMAP.md` | ✅ Phase complete checkbox + Progress table updated |
| `docs/FILE_MAP.md` | ⚠️ New feature area "Channel Integration" — add row + file list |
| `CLAUDE.md` | No change needed (spine is additive; existing pitfalls still apply) |

### CHANGELOG.md Entry Draft
Already landed via Plan 11 commit `44cc83e0`. Content reviewed — accurate and comprehensive.

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** **Insufficient** (due to C1 — 7 permanently RED tests in channelAudit)

### Planned Tests vs Landed

| Layer | Coverage | Status |
|-------|----------|--------|
| Backend unit (convex-test) | channelRouting (6 tests GREEN), channelSale (GREEN), saveRevenueItemsHook (6 GREEN), normalize (9 GREEN across 3 adapters), consignment settlement items | ✅ Mostly adequate |
| Backend unit (channelAudit) | 7 RED (test-vs-impl drift) | ❌ MUST FIX per C1 |
| Integration | K3Mart regression (fixture-gated, scaffold present) | ⚠️ Fixtures not yet captured — 74.5.2 blocker |
| Frontend components | Lint-grade (grep-based acceptance) | ⚠️ No React test for any new component |
| E2E (Playwright) | Un-skipped but `test.fixme` awaiting dev-server smoke | ⚠️ HUMAN-UAT gated |

### Missing Test Coverage (Must Add before 74.5.2 cutover)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | Rewrite 7 channelAudit.test.ts tests to match impl shape | Audit logic has NO regression protection | Rewrite tests per C1 mapping; run against real `channelAudit.ts` exports |
| 2 | Frontend component tests for 3 admin pages | 1769 LOC of critical admin UI is uncovered by tests | Vitest + RTL smoke tests (render + primary action click + error state) |
| 3 | K3Mart regression fixture capture | D-08 mandates byte-identical output; without fixtures, 74.5.2 cutover can silently drift | Capture 5-10 recent sync payloads + 5-10 settlements pre-cutover |
| 4 | Flag-gate assertion in saveRevenueItems hook | Ship-dark contract (D-10) has NO automated regression test | Add a test: with flag OFF, no `productInventoryTransactions` channel_sale row is written |

### Regression Risk

- Phase 80.1/80.2/80.3 analytics pipeline uses `externalRevenueItems` — spine adds `inventoryDeductedAt` column (optional) which should not affect analytics. Smoke test recommended.
- `processGofoodSales` preserved (D-03 gofood_sale literal preserved) — existing GoFood sync flow unchanged. Regression-test before release.

---

## 11. Edge Cases to Address

- [x] Absent flag = OFF (D-10) — implemented via `?? false` coercion in Plan 05 hook
- [x] Missing routing rule (CHANNEL_ROUTING_NOT_CONFIGURED) — bubbles up per SPEC; Plan 04 impl throws
- [x] Historical timestamp preservation — `createdAt: event.occurredAt` verified in Plan 04
- [x] Admin-only mutations — every write gated with `requireRole(..., ["admin"])`
- [ ] **Zero-quantity item** — Plan 04 claims skip without write; needs assertion test (deferred to C1 test rewrite)
- [ ] **Duplicate externalTransactionId+externalItemId** — Plan 04 has duplicate_transaction audit type but no de-dup on write; verify behavior is intentional
- [ ] **Flag flipped mid-sync** — if admin flips shopee ON while a sync is in-flight, what happens to already-processed items? Ship-dark status means this isn't urgent but should be documented
- [ ] **Orphan cleanup** — `orphan_item` issue type detects but no auto-resolution. Manual admin action required. Document in UI tooltip (already in UI-SPEC)

---

## 12. Approval Conditions

### For Approval (must address before merge to main)
1. Update `docs/SCHEMA.md` with 3 new tables + indexes
2. Update `docs/API_REFERENCE.md` with new mutations/queries
3. Update `docs/FILE_MAP.md` with "Channel Integration" feature area
4. Commit staffreview file (this document)

### Before 74.5.2 (cutover) — must address before flipping any flag
1. Fix C1 — rewrite 7 channelAudit.test.ts tests against real impl shape
2. Add flag-gate regression test (missing #4 from §10)
3. Capture K3Mart regression fixtures per D-08
4. Add frontend component smoke tests for the 3 admin pages
5. Run full human UAT smoke per HUMAN-UAT.md

### Recommended polish (post-merge, low priority)
1. Refinements R1-R6 (lint warnings, helper cleanup)
2. Improvement I1-I5 (process documentation for 74.5.2)

---

## 13. Production Readiness Verdict

**Ship-dark contract (D-10):** ✅ **Airtight**
- Flag-map default all-false
- Absent flag coerces to false
- saveRevenueItems hook dispatches only when flag is truthy
- Existing `processGofoodSales` path untouched
- GoFood `gofood_sale` literal preserved

**Behavioral change risk at merge:** **Near-zero**. Only observable change: 3 new admin routes appear at `/admin/channel-routing`, `/admin/channel-audit`, `/admin/product-inventory-settings` — gated behind admin role, ignorable by other roles. No automated sync flow changes observable state until a flag is flipped.

**Merge recommendation:** **APPROVE** pending the 4 "For Approval" doc updates above. The C1 test drift is documented debt, not a merge blocker, because the impl is manually verified via VERIFICATION.md and the flag-OFF contract means audit logic isn't actually running in prod today.

---

*Generated by /staffreview skill — 2026-04-20*
*Staff Developer Review (implementation elegance, duplication, patterns) + Principal Developer Review (architecture, schema, production readiness)*
