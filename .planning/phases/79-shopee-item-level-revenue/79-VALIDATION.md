---
phase: 79
slug: shopee-item-level-revenue
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
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

*Planner fills one row per task in each PLAN.md, mirroring the <automated> blocks.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD     | TBD  | TBD  | TBD         | TBD        | TBD             | TBD       | TBD               | TBD         | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 test-file gaps identified in RESEARCH.md:

- [ ] `convex/bigseller/priceOracle.test.ts` — property tests for `buildPriceOracle` (median over single-SKU `bigsellerOrders`)
- [ ] `convex/bigseller/prorateItems.test.ts` — `prorateItems` sum invariant: Σ items.totalPrice === parent.revenueGross exactly (residual → largest-qty item)
- [ ] `convex/bigseller/dominantSku.test.ts` — `dominantSku(items)` returns max-skuNum SKU; ties broken by max `menuProduct.price`
- [ ] `convex/bigseller/backfill.test.ts` — idempotency: running backfill twice creates zero new items on second run
- [ ] `convex/bigseller/cascade.test.ts` — SKU→menuProduct mapping cascade updates all child items + dominant-SKU parent linkedMenuProductId
- [ ] `convex/bigseller/cron.test.ts` — skip-if-not-idle: cron writes `externalSyncLogs` error row with `skipped: manual sync in progress`
- [ ] `convex/reports/sellThrough.shopee.test.ts` — shopee/tiktok branch returns real per-product volume (not revenue-extrapolated)
- [ ] `convex/bigseller/saveRevenueItems.test.ts` — dedup on `(revenueId, externalItemId)` composite; no double-counted revenue

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Pending SKU from Shopee" UI label | DA-13 | Cross-platform UI display in live browser | Open `/sales-analytics`, locate Shopee row with age < 24h and empty skuVoList, verify label text |
| BigSellerSyncPanel backfill button | DA-11 | Admin-triggered long-running mutation + toast progress | Click "Backfill historical items" in `BigSellerSyncPanel`; verify toast shows `Created N items from M orders` |
| "Re-check empty rows" button | DA-13 | Admin workflow with date-range re-fetch | Click "Re-check empty rows"; verify new items appear for previously `--` rows that Shopee has since populated |
| Daily 03:00 WIB cron fires | DA-12 | Cron timing is environment-dependent | Inspect `externalSyncLogs` after 20:00 UTC; confirm an entry exists for today with stage transitions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
