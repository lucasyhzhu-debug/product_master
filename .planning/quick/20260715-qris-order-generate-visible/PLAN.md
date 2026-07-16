---
quick_id: 20260715-qris-order-generate-visible
title: QRIS "Generate" button visibility + attached-payment indicator on order surfaces
status: in-progress
date: 2026-07-15
branch: feature/qris-order-generate-button
---

# QRIS on the order slide-out — make it visible + persist the attached payment

## Problem (diagnosed)
Phase 84 shipped a full QRIS flow (`QrisChargeDialog`) wired into BOTH order surfaces,
but the "Charge via QRIS" button was invisible because of two gates:
1. `qrisConfig.enabled` reads `QRIS_ENABLED` env — dev=true, **prod OFF** (pending Xendit KYB).
2. `order.status === 'AwaitingPayment'` — button only appears in that one transient status.

Additionally, once an order paid via QRIS and auto-transitioned to PaymentReceived,
the button disappeared and **there was no surface showing that a QRIS payment was attached.**

## Decision (user, 2026-07-15)
- KEEP the generate button constrained to `AwaitingPayment` (no webhook/backend change — safest).
- ADD a read-only "QRIS payment attached" row visible whenever a pending/paid QRIS row
  exists — so a paid QRIS stays visible after the order transitions.
- Rename button "Charge via QRIS" → "Generate QRIS" (matches user mental model).

## Git Workflow
**Branch:** `feature/qris-order-generate-button`
**Checkpoints:** single wave (frontend-only, additive)

## Implementation Waves
### Wave 1: Frontend [additive, no backend]
| Task | Files |
|------|-------|
| New shared presentational `OrderQrisStatus` (pending/paid row + View) | `src/components/orders/OrderQrisStatus.tsx` |
| Wire + rename in slide-over | `src/components/orders/OrderSlideOver.tsx` |
| Wire + rename in full page (Pitfall #20 mirror) | `src/pages/OrderDetail.tsx` |
| Unit test for the shared component | `src/components/orders/__tests__/OrderQrisStatus.test.tsx` |

### Wave 2: Verification [SEQUENTIAL]
| Task |
|------|
| `npx tsc -b` (pass) |
| vitest orders + qrisPayments suites (pass) |
| `npm run build` (pass) |
| code review |

## Documentation Updates
- [ ] CHANGELOG.md (patch — sub-feature)

## Success Criteria
- [ ] type-check passes
- [ ] build succeeds
- [ ] Generate button shows on AwaitingPayment (unchanged), labelled "Generate QRIS"
- [ ] Attached QRIS payment (pending/paid) visible on both surfaces regardless of status
- [ ] No backend / webhook / schema change

## Ops (not code — carried)
- Flip `QRIS_ENABLED=true` in **prod** + swap to live Xendit keys when KYB clears
  (dev already =true). Until then the button + indicator stay hidden on the live app.
