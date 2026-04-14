# Staff Review: Phase 79 — Shopee Item-Level Revenue

**Date:** 2026-04-14
**Plan:** `.planning/phases/79-shopee-item-level-revenue/` (7 plans: 79-01..79-07)
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Upstream gates passed:** gsd-plan-checker iter 1 (4 warnings → fixed), iter 2 (1 blocker → fixed), iter 3 PASSED.

---

## 1. Summary

**Overall Assessment: Approve with 2 improvements and 3 refinements.**

The phase is well-scoped and tight. It mirrors the verified GoBiz adapter pattern for an already-working feature (GoFood/GoJek item-level analytics), so architectural risk is low. The three pure helpers (`buildPriceOracle`, `prorateItems`, `dominantSku`) are well-isolated and test-first per Wave 0. The DA-11 (buyer capture) deferral is correctly justified by research evidence and does not require schema changes. No critical issues; remaining concerns are refinements around oracle refresh strategy, cascade batch limits, and one UI edge case.

---

## 2. Critical Issues (Must Fix)

**None.** The plan-checker caught the structural blockers (research resolution, Wave 0 test coverage, file modification gaps, task sizing) and the planner resolved them in revision iteration 1. No decision-contradiction, no double-counting risk, no unauthorized mutation.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Oracle staleness policy — when is `buildPriceOracle` rebuilt? | Medium | Low |
| 2 | Cascade mutation — guard against Convex 16MB mutation limit on large product mappings | Medium | Low |

### Improvement 1: Oracle Staleness Policy

**Issue:** Plan 03 calls `buildPriceOracle(singleSkuOrders)` during sync. Research §Validation Architecture notes median stability, but neither plan documents:
- Is the oracle rebuilt on every sync (expensive for large order history) or cached?
- Does Plan 04's cascade mutation invalidate the oracle (new SKU→menuProduct mapping may shift which tier the fallback uses)?
- Is there a minimum-sample threshold (e.g., skip SKUs with < 3 historical single-SKU observations) to avoid median-on-tiny-n noise?

**Recommendation:** Add an explicit note in Plan 03 Task 1 (oracle build) stating:
- Oracle is rebuilt on every sync invocation (no cache — acceptable at expected volume: ~6K bigsellerOrders from research §Pitfalls).
- Include minimum-sample guard in `buildPriceOracle`: if `prices.length < 2`, omit from oracle (caller falls through to tier 2: `menuProduct.price`).
- No coupling to cascade — cascade updates `linkedMenuProductId` on items, which is an attribution field, not a pricing field. Oracle is price-only.

Document as a code comment in `buildPriceOracle`. No plan edit required if the note lands in the implementation.

### Improvement 2: Cascade Batch Size Guard

**Issue:** Plan 04 (retroactive SKU→menuProduct cascade) patches all past `externalRevenueItems` rows matching a SKU in a single mutation. Convex has a 16MB mutation payload / 8K-doc read limit per transaction. A hot SKU with several years of Shopee history could exceed this.

**Recommendation:** Plan 04 Task 1 `<action>` should include:
- Count candidate items first via `ctx.db.query("externalRevenueItems").withIndex(…).collect()`; if count > 4000, split into pagination via an action that schedules batches.
- Add acceptance criterion: `mutation processes ≤ 4000 items; larger batches deferred to scheduled action`.
- Or document that the Frollie Shopee scale is known < 4000 per SKU and no batching needed (research confirms ~6K total bigsellerOrders across all SKUs, so per-SKU batches are small — this is the likely actual state).

If the latter: add a code comment `// Frollie Shopee volume (~6K total orders) keeps cascade under Convex limits; revisit if SKU exceeds 4000 items`.

---

## 4. Refinements (Minor Suggestions)

- **Plan 03 cross-platform guard:** the grep assertion that gofood/gojek code paths are unchanged is clever but brittle if another phase refactors `integrations/gobiz/`. Consider a narrower assertion like "no new imports into `convex/integrations/gobiz/**`" rather than a line-count diff.
- **Plan 05 cron label:** `"skipped: manual sync in progress"` is grep-asserted verbatim. Ensure this string is a constant (e.g., `SKIP_REASON_MANUAL_SYNC`) rather than inlined, so future edits don't silently break the assertion.
- **Plan 07 "Pending SKU from Shopee" i18n:** label is hard-coded English. Frollie is Indonesian FMCG; check whether other UI labels are bilingual. If so, add to the i18n pattern used elsewhere; if not, acceptable as-is.

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `saveRevenueItems` (dedup via `revenueId + externalItemId`) | `convex/externalData/mutations.ts:587-644` | Plan 03 + Plan 07 reuse directly — no new dedup logic |
| GoBiz adapter `saveRevenue → saveRevenueItems` pattern | `convex/integrations/gobiz/adapter.ts:450-490` | Plan 03 canonical reference (mirror structure) |
| `resolveSkuVoListOnUpdate` preserve-non-empty guard | `convex/bigsellerOrders/mutations.ts:1-100` | Plan 05 "Re-check empty rows" relies on this — already lands preserved behavior |
| `applyRetroactiveProductMapping` | `convex/externalData/mutations.ts:446-495` | Plan 04 extends (not rewrites) |
| Source-agnostic `computeLifetimeTotals` + `resolveItemsCOGS` | `convex/externalData/helpers/lifetimeHelpers.ts`, `convex/reports/incomeStatement.ts:133-184` | Plan 06 documents zero-change assertion — items auto-picked-up |

### Potential Duplication Risks

- **None flagged.** The research phase explicitly identified that lifetime + COGS need zero code changes (source-agnostic already). Planner honored this by writing Plan 06 Task 2 as a git-diff zero-change assertion rather than a rewrite.

---

## 6. Phase/Wave Accuracy

| Plan | Wave | Assessment |
|------|------|------------|
| 01 Wave 0 test scaffolding | 0 | Good — 11 failing tests cover all 9 DA-XX + 2 UI stubs |
| 02 Pure helpers (oracle/prorate/dominantSku) | 1 | Good — isolated pure functions, depends only on Wave 0 |
| 03 BigSeller item emit (split: oracle/mapping prep + emit loop) | 2 | Good after revision split; depends on 01 + 02 |
| 04 Cascade + retroactive | 2 | Good — parallel with 03 since they touch different files |
| 05 Cron + sync skip | 2 | Good — parallel (no overlap with 03/04 files) |
| 06 Reports branches | 2 | Good — parallel (read-only zero-change + new sell-through branch) |
| 07 Backfill + UI | 3 | Correctly sequenced last; depends on 02/03/04 being in place |

**Ordering: correct.** Backend helpers → sync emit → reports/cron/cascade in parallel → admin tooling last.

**Missing phases: none.** All 9 DA-XX requirements mapped. DA-11 deferral is explicitly documented rather than stubbed, which is the correct call per research finding #1.

---

## 7. Specialist Agent Recommendations

| Plan | Recommended Agent | Rationale |
|------|-------------------|-----------|
| 01 Wave 0 tests | `tdd-test-architect` | Test scaffolding is core specialty |
| 02 Pure helpers | `convex-backend` | Pure TS in convex/ |
| 03 BigSeller emit | `convex-backend` | Sync mutation + integrations/ refactor |
| 04 Cascade | `convex-backend` | Cross-table mutation with idempotency |
| 05 Cron + sync skip | `convex-backend` | crons.ts + scheduled action |
| 06 Reports branches | `convex-backend` | Query extensions + zero-change audit |
| 07 Backfill + UI | `cto-orchestrator` (or split `convex-backend` + `react-ui-builder`) | Cross-stack (2 mutations + 3 UI files) |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Check | Status |
|-------|--------|
| Feature branch specified | ✅ Implicit via CLAUDE.md branch-per-phase rule: `feature/79-shopee-item-level-revenue` |
| Branch naming convention | ✅ Follows `feature/{padded_phase}-{slug}` |
| Merge strategy | ✅ Per CLAUDE.md: PR after `npm run build` passes |

### Commit Strategy
Plans follow GSD atomic-commit pattern: each task completion → one commit via `gsd-tools commit`. Natural commit seams:
1. Wave 0 complete → `test(79): wave 0 test scaffolding for Shopee item-level revenue`
2. Plan 02 → `feat(79): pure helpers for Shopee price oracle and proration`
3. Plan 03 (now 2 tasks) → 2 commits (prep + emit)
4. Plan 04 → `feat(79): retroactive SKU→menuProduct cascade for Shopee items`
5. Plan 05 → `feat(79): daily BigSeller re-sync cron with skip-if-busy`
6. Plan 06 → `feat(79): sell-through + COGS branches for Shopee/TikTok`
7. Plan 07 → 2-3 commits (mutations, UI, manual checkpoint)

### Pre-Push Verification
- ✅ All plans inherit CLAUDE.md requirement: `npm run build` must pass
- ✅ Nyquist sampling via VALIDATION.md requires `npm run test -- --run` per wave
- ✅ Plan 01 Wave 0 locks in test-first discipline

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | ✅ No schema changes — backfill is idempotent; cascade is replayable |
| Deployment order | ✅ Convex deploys before Vercel (per repo CI) — sync changes land first |
| Data backup needed | ⚠️ Plan 07 backfill is a one-way data write. Recommend `npx convex export` before first backfill click (manual step in Plan 07 Task 4 checkpoint script) |
| Migration safety | ✅ No schema migration — all fields already exist on `externalRevenueItems` |

---

## 9. Documentation Checkpoints

| Plan | Documentation Update Required |
|------|-------------------------------|
| 01–07 each | SUMMARY.md per GSD convention |
| 07 | `docs/CHANGELOG.md` entry after merge (mandatory per CLAUDE.md) |
| 07 | `.planning/REQUIREMENTS.md` — add DA-05..DA-13 rows (plan-checker info item #5) |
| 06 | `docs/API_REFERENCE.md` — new sell-through branch + unchanged lifetime/COGS (should note item-source coverage extension) |
| 03 | `docs/SCHEMA.md` — confirm no schema change; add prose line that `externalRevenueItems` now has Shopee/TikTok sources |

### CHANGELOG.md Entry (Draft)

```markdown
## 2026-04-?? - Phase 79: Shopee Item-Level Revenue

**Shopee and TikTok channels now support per-product analytics identical to GoJek/GoFood.**

- BigSeller sync emits one `externalRevenueItems` row per `skuVoList` entry (no double-counted revenue)
- Three-tier unit price: historical median oracle → menuProduct.price → flat share
- Retroactive SKU→menuProduct mapping cascades to items + sets dominant-SKU parent
- Daily 03:00 WIB cron re-syncs trailing 7 days; skips if manual sync in progress
- Sell-through analytics includes real Shopee/TikTok per-product volume (no revenue extrapolation)
- Lifetime ball counts and per-product COGS auto-pick-up Shopee items (source-agnostic queries)
- Admin: "Backfill historical items" + "Re-check empty rows" buttons in BigSellerSyncPanel
- UI: "Pending SKU from Shopee" label for rows < 24h with empty SKU data
- DA-11 (buyer fields) deferred — BigSeller pageList API does not expose them

**Files Modified:**
- `convex/integrations/bigseller/helpers.ts`
- `convex/integrations/bigseller/sync.ts`
- `convex/bigsellerOrders/{mutations,queries}.ts`
- `convex/externalData/{mutations,queries}.ts`
- `convex/reports/{sellThrough,incomeStatement}.ts`
- `convex/crons.ts`
- `src/components/salesAnalytics/BigSellerSyncPanel.tsx`
- `src/components/salesAnalytics/BigSellerOrdersTable.tsx`
- `src/hooks/convex/useBigSeller.ts`

**Requirements closed:** DA-05 through DA-13 (DA-11 deferred with documentation)
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict: Adequate.**

VALIDATION.md defines 11 Wave 0 tests (expanded from 9 after revision iter 1):
- 3 pure helper tests (priceOracle, prorateItems, dominantSku)
- 6 integration tests (cron, backfill, revenue invariants, retroactive mapping, sell-through, income statement)
- 2 UI component smoke tests (BigSellerSyncPanel, BigSellerOrdersTable)

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend pure | buildPriceOracle / prorateItems / dominantSku | Vitest | Planned (Plan 02) |
| Backend integration | BigSeller sync emits items, no double-count | convex-test | Planned (Plan 03) |
| Backend integration | Cascade updates items + dominant parent | convex-test | Planned (Plan 04) |
| Backend integration | Cron skip-if-not-idle | convex-test | Planned (Plan 05) |
| Backend integration | Sell-through real-volume branch | convex-test | Planned (Plan 06) |
| Backend integration | Source-agnostic pickup (zero-change guard) | convex-test + git diff | Planned (Plan 06) |
| Backend integration | Backfill idempotency | convex-test | Planned (Plan 07) |
| Frontend smoke | BigSellerSyncPanel buttons render + toast | Vitest + RTL | Planned (Plan 01 Wave 0) |
| Frontend smoke | BigSellerOrdersTable "Pending SKU" label threshold | Vitest + RTL | Planned (Plan 01 Wave 0) |
| Manual | End-to-end backfill + 24h label live | Checkpoint | Planned (Plan 07 Task 4) |

### Regression Risk

- **lifetime + COGS queries:** Plan 06 Task 2 enforces zero-modification via git-diff. Any accidental edit fails CI.
- **GoFood/GoJek sync paths:** Plan 03 cross-platform guard asserts no changes to `convex/integrations/gobiz/**`.
- **Existing BigSeller users:** cron skip-if-not-idle prevents stomping on manual syncs (D-12).

Regression protection is solid.

---

## 11. Edge Cases to Address

Plans explicitly handle:
- [x] Empty `skuVoList` on same-day Shopee rows (Plan 07 D-14 24h label)
- [x] Multi-SKU orders with residual rounding (Plan 02 D-01)
- [x] SKUs with no mapped menuProduct at sync time (Plan 02 D-02 flat share fallback)
- [x] Cron firing while manual sync running (Plan 05 D-12)
- [x] Running backfill twice (Plan 07 D-18 idempotency)
- [x] Dominant-SKU ties (Plan 02 D-09: highest menuProduct.price wins)
- [x] BigSeller API lacks buyer fields (DA-11 deferred with documentation)

Additional edges worth verifying during execution:
- [ ] Oracle with 1 data point per SKU (→ median-of-1 = that value — check if this is desired or should fall through to tier 2). **See Improvement 1.**
- [ ] Cascade on a SKU with no items yet (should be no-op, not an error)
- [ ] 24h threshold boundary at exactly 24h00m00s (pick `<` vs `<=` consistently)
- [ ] Shopee order with `skuVoList.length === 1` but `skuNum === 0` (division guard in priceOracle)

---

## 12. Approval Conditions

**For Approval, address:**
- None (all critical items resolved upstream).

**Recommended before implementation:**
1. Add oracle minimum-sample guard (Improvement 1) — lands as code comment + `if (prices.length < 2) continue;` in `buildPriceOracle`.
2. Add cascade batch guard or documented scale assumption (Improvement 2) — code comment + acceptance criterion in Plan 04.

**Optional refinements:**
- Extract `"skipped: manual sync in progress"` to a constant (Refinement 2).
- Pre-backfill `npx convex export` in Plan 07 Task 4 checkpoint script.

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
