---
phase: 79
slug: shopee-item-level-revenue
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-14
planned: 2026-04-14
---

# Phase 79 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Populated by planner from RESEARCH.md Validation Architecture section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x + convex-test |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- --run <pattern>` |
| **Full suite command** | `npm run test -- --run` |
| **Estimated runtime** | ~60–90 seconds (backend unit + convex-test) |

---

## Sampling Rate

- **After every task commit:** Run scoped `npm run test -- --run <pattern>` for touched files
- **After every plan wave:** Run full suite `npm run test -- --run`
- **Before `/gsd-verify-work`:** Full suite green + `npm run build`
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID   | Plan | Wave | Requirement       | Threat Ref | Secure Behavior                                            | Test Type   | Automated Command                                                                                    | File Exists | Status     |
|-----------|------|------|-------------------|-----------|-------------------------------------------------------------|-------------|------------------------------------------------------------------------------------------------------|-------------|------------|
| 79-01-T1  | 01   | 0    | DA-05             | —         | Pure-helper test scaffolding (priceOracle, prorate, dominantSku) | unit        | `npm run test -- --run convex/integrations/bigseller/__tests__/priceOracle.test.ts convex/integrations/bigseller/__tests__/prorateItems.test.ts convex/integrations/bigseller/__tests__/dominantSku.test.ts` | pending Wave 0 | ⬜ pending |
| 79-01-T2  | 01   | 0    | DA-05..DA-13      | —         | Integration + component test scaffolding (cron, backfill, invariants, retro, sellThrough, COGS, BigSellerSyncPanel, BigSellerOrdersTable) | integration+component | `npm run test -- --run convex/integrations/bigseller/__tests__/cron.test.ts convex/bigsellerOrders/__tests__/backfill.test.ts convex/externalData/__tests__/revenue-invariants.test.ts convex/externalData/__tests__/retroactive-mapping-shopee.test.ts convex/externalData/__tests__/sell-through-shopee.test.ts convex/reports/__tests__/incomeStatement-shopee.test.ts src/components/salesAnalytics/__tests__/BigSellerSyncPanel.test.tsx src/components/salesAnalytics/__tests__/BigSellerOrdersTable.test.tsx` | pending Wave 0 | ⬜ pending |
| 79-01-T3  | 01   | 0    | —                 | —         | VALIDATION.md populated + wave_0_complete flipped          | meta        | `grep -q "wave_0_complete: true" .planning/phases/79-shopee-item-level-revenue/79-VALIDATION.md` | pending Wave 0 | ⬜ pending |
| 79-02-T1  | 02   | 1    | DA-05             | T-79-01   | prorate sum invariant, dominantSku tie-break               | unit        | `npm run test -- --run convex/integrations/bigseller/__tests__/priceOracle.test.ts convex/integrations/bigseller/__tests__/prorateItems.test.ts convex/integrations/bigseller/__tests__/dominantSku.test.ts` | ✅ (Wave 0) | ⬜ pending |
| 79-03-T1  | 03   | 2    | DA-05             | —         | Oracle + mappingBySku pre-loaded once per sync run | integration | `npm run test -- --run convex/integrations/bigseller/__tests__/priceOracle.test.ts convex/integrations/bigseller/__tests__/helpers.test.ts` | ✅ (Wave 0) | ⬜ pending |
| 79-03-T2  | 03   | 2    | DA-05, DA-11      | T-79-01, T-79-02, T-79-03 | No cross-platform leak; DA-11 deferral documented | integration | `npm run test -- --run convex/externalData/__tests__/revenue-invariants.test.ts convex/integrations/bigseller/__tests__/helpers.test.ts` | ✅ (Wave 0) | ⬜ pending |
| 79-04-T1  | 04   | 2    | DA-06             | T-79-05, T-79-06, T-79-07 | Admin-gated cascade; dominant-SKU rule            | integration | `npm run test -- --run convex/externalData/__tests__/retroactive-mapping-shopee.test.ts` | ✅ (Wave 0) | ⬜ pending |
| 79-05-T1  | 05   | 2    | DA-12             | T-79-08, T-79-09, T-79-10 | Skip-if-busy cron; no retry flood                 | integration | `npm run test -- --run convex/integrations/bigseller/__tests__/cron.test.ts` | ✅ (Wave 0) | ⬜ pending |
| 79-06-T1  | 06   | 2    | DA-07             | —         | Sell-through qty from items, not revenue/avgPrice          | integration | `npm run test -- --run convex/externalData/__tests__/sell-through-shopee.test.ts` | ✅ (Wave 0) | ⬜ pending |
| 79-06-T2  | 06   | 2    | DA-08, DA-09      | —         | Source-agnostic lifetime + COGS auto-pickup                | integration | `npm run test -- --run convex/reports/__tests__/incomeStatement-shopee.test.ts` | ✅ (Wave 0) | ⬜ pending |
| 79-07-T1  | 07   | 3    | DA-10             | T-79-11, T-79-12, T-79-13 | Admin-gated backfill; idempotent                  | integration | `npm run test -- --run convex/bigsellerOrders/__tests__/backfill.test.ts` | ✅ (Wave 0) | ⬜ pending |
| 79-07-T2  | 07   | 3    | DA-10             | —         | UI toasts + buttons                                        | component   | `npm run test -- --run src/components/salesAnalytics/__tests__/BigSellerSyncPanel.test.tsx` | ✅ (Wave 0) | ⬜ pending |
| 79-07-T3  | 07   | 3    | DA-11, DA-13      | T-79-15   | 24h label; no buyer columns (deferral)                     | component   | `npm run test -- --run src/components/salesAnalytics/__tests__/BigSellerOrdersTable.test.tsx` | ✅ (Wave 0) | ⬜ pending |
| 79-07-T4  | 07   | 3    | DA-05..DA-13      | —         | Human verification                                         | manual      | Checkpoint — see Plan 07 Task 4 script                     | —           | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 test-file gaps from RESEARCH.md §Validation Architecture. Plan 01 creates all of these.

- [ ] `convex/integrations/bigseller/__tests__/priceOracle.test.ts` — property tests for `buildPriceOracle` (median over single-SKU `bigsellerOrders`)
- [ ] `convex/integrations/bigseller/__tests__/prorateItems.test.ts` — `prorateItems` sum invariant: Σ items.totalPrice === parent.revenueGross exactly (residual → largest-qty item)
- [ ] `convex/integrations/bigseller/__tests__/dominantSku.test.ts` — `dominantSku(items)` returns max-skuNum SKU; ties broken by max `menuProduct.price`
- [ ] `convex/bigsellerOrders/__tests__/backfill.test.ts` — idempotency: running backfill twice creates zero new items on second run
- [ ] `convex/externalData/__tests__/retroactive-mapping-shopee.test.ts` — SKU→menuProduct mapping cascade updates all child items + dominant-SKU parent linkedMenuProductId
- [ ] `convex/integrations/bigseller/__tests__/cron.test.ts` — skip-if-not-idle: cron writes `externalSyncLogs` error row with `skipped: manual sync in progress`
- [ ] `convex/externalData/__tests__/sell-through-shopee.test.ts` — shopee/tiktok branch returns real per-product volume (not revenue-extrapolated)
- [ ] `convex/externalData/__tests__/revenue-invariants.test.ts` — parent/child sum equality (D-04 anti-double-count)
- [ ] `convex/reports/__tests__/incomeStatement-shopee.test.ts` — Shopee per-product COGS uses BOM × quantity
- [ ] `src/components/salesAnalytics/__tests__/BigSellerSyncPanel.test.tsx` — Backfill + Re-check button render/click (Plan 07 T2 coverage)
- [ ] `src/components/salesAnalytics/__tests__/BigSellerOrdersTable.test.tsx` — 24h "Pending SKU from Shopee" label branch + DA-11 buyer-column absence (Plan 07 T3 coverage)

*Plan 01 Task 3 flips `wave_0_complete: true` and checks all boxes once the 11 files land.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Pending SKU from Shopee" UI label | DA-13 | Cross-platform UI display in live browser | Open `/sales-analytics`, locate Shopee row with age < 24h and empty skuVoList, verify label text |
| BigSellerSyncPanel backfill button | DA-10 | Admin-triggered long-running mutation + toast progress | Click "Backfill historical items" in `BigSellerSyncPanel`; verify toast shows `Created N items from M orders` |
| "Re-check empty rows" button | DA-13 | Admin workflow with date-range re-fetch | Click "Re-check empty rows"; verify new items appear for previously `--` rows that Shopee has since populated |
| Daily 03:00 WIB cron fires | DA-12 | Cron timing is environment-dependent | Inspect `externalSyncLogs` after 20:00 UTC; confirm an entry exists for today with stage transitions |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (11 files — 9 backend + 2 UI component stubs)
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [ ] `wave_0_complete: true` (flipped by Plan 01 Task 3 at execution time)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned 2026-04-14 by planner. wave_0_complete flag flips during execution.
