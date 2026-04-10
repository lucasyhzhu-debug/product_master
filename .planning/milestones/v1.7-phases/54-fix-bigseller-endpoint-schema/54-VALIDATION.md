---
phase: 54
slug: fix-bigseller-platform-specific-endpoint-schema-mismatches
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 54 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.18 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- --run convex/integrations/bigseller/__tests__/` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run convex/integrations/bigseller/__tests__/`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 54-01-01 | 01 | 0 | BUG-01..06 | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/normalization.test.ts` | No -- Wave 0 | ⬜ pending |
| 54-01-02 | 01 | 1 | BUG-01 | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/normalization.test.ts` | No -- Wave 0 | ⬜ pending |
| 54-01-03 | 01 | 1 | BUG-02 | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/normalization.test.ts` | No -- Wave 0 | ⬜ pending |
| 54-01-04 | 01 | 1 | BUG-03 | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/normalization.test.ts` | No -- Wave 0 | ⬜ pending |
| 54-01-05 | 01 | 1 | BUG-04 | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/normalization.test.ts` | No -- Wave 0 | ⬜ pending |
| 54-01-06 | 01 | 1 | BUG-05 | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/normalization.test.ts` | No -- Wave 0 | ⬜ pending |
| 54-01-07 | 01 | 1 | BUG-06 | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/normalization.test.ts` | No -- Wave 0 | ⬜ pending |
| 54-01-08 | 01 | 1 | CASE | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/normalization.test.ts` | No -- Wave 0 | ⬜ pending |
| 54-01-09 | 01 | 2 | REGRESSION | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/` | Yes | ⬜ pending |
| 54-01-10 | 01 | 1 | ENH-ORDERAMOUNT | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/normalization.test.ts` | No -- Wave 0 | ⬜ pending |
| 54-02-01 | 02 | 2 | ENH-REVENUE-SEMANTICS | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/helpers.test.ts` | Yes | ⬜ pending |
| 54-02-02 | 02 | 2 | ENH-SHIPPING-DISPLAY | visual | Manual: verify BigSellerOrdersTable shows buyer shipping column | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `convex/integrations/bigseller/__tests__/normalization.test.ts` — stubs for BUG-01 through BUG-06 + CASE mismatch, using HAR-confirmed values as assertions
- [ ] Update existing test files (`helpers.test.ts`, `helpers-edge-cases.test.ts`) for new function signatures

**CRITICAL:** `normalizePlatformFees` currently has ZERO test coverage despite being the core normalization function.

*Existing infrastructure:* `helpers.test.ts` and `helpers-edge-cases.test.ts` exist for helper functions.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Revenue column shows non-zero values | BUG-01 | Requires live BigSeller sync | Trigger sync, verify Revenue column in Synced Orders table |
| TikTok orders show "TikTok" badge | BUG-02 | Requires live data | Check platform badges in Synced Orders table after sync |
| Profit column matches BigSeller value | BUG-06 | Requires live data comparison | Compare profit in Synced Orders with BigSeller dashboard |
| Gross Revenue column shows orderAmount (incl. shipping) | ENH-ORDERAMOUNT | Requires live data | Verify Gross Revenue = product price + buyer shipping |
| Buyer Shipping column visible | ENH-SHIPPING-DISPLAY | Visual | Check buyer shipping column appears in Synced Orders table |
| externalRevenue.revenueGross reflects total buyer paid | ENH-REVENUE-SEMANTICS | Requires live data | After sync, check externalRevenue records have orderAmount-based revenueGross |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
