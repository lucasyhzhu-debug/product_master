---
quick_id: 20260715-qris-order-generate-visible
status: complete
date: 2026-07-15
branch: feature/qris-order-generate-button
---

# SUMMARY — QRIS visibility on order surfaces

## Outcome
Frontend-only, additive. No backend/webhook/schema change.

**Root cause of "I can't see QRIS anywhere":** the Phase-84 "Charge via QRIS" button
already existed on both surfaces but was hidden by (a) `QRIS_ENABLED` off in prod
(KYB pending) and (b) `status === 'AwaitingPayment'`-only gating. Per user decision the
button stays constrained to AwaitingPayment.

**Gap fixed:** after an order pays via QRIS and auto-transitions, the button vanished and
the attached QRIS payment was invisible. Added a read-only `OrderQrisStatus` row (paid =
always visible; pending = visible only while collectible — suppressed on terminal orders
and after the 30-min window). Renamed button → "Generate QRIS".

## Changes
- `src/components/orders/OrderQrisStatus.tsx` — new shared presentational row.
- `src/components/orders/__tests__/OrderQrisStatus.test.tsx` — new (6 tests).
- `src/components/orders/OrderSlideOver.tsx` — wire + rename.
- `src/pages/OrderDetail.tsx` — wire + rename (Pitfall #20 mirror).
- `docs/CHANGELOG.md` — 2.4.1.

## Verification
- `npx tsc -b` — pass
- vitest orders + qrisPayments (75) + OrderQrisStatus (6) — pass
- `npm run build` — exit 0
- code-review (sonnet): 2 medium findings (terminal-status + expiry on pending branch) — BOTH fixed.

## Carried / ops
- Flip `QRIS_ENABLED=true` in prod + live Xendit keys when KYB clears (dev already on).
- Not addressed (out of scope): subscription-order Actions branch has no QRIS (credit-funded);
  webhook still only transitions from AwaitingPayment (unchanged — button constrained to match).
