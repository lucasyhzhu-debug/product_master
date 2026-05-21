---
phase: 84-qris-payment-integration
plan: 01
subsystem: testing
tags: [qris, xendit, payments, qrcode.react, vitest, convex-test, playwright, tdd, bundle-cap]

# Dependency graph
requires:
  - phase: 84-qris-payment-integration (research/spec/patterns)
    provides: pure-fn signatures (buildCreateQrBody, verifyCallbackToken, decideWebhookOutcome), qrisPayments schema shape, inventory-reserve seeding requirements
provides:
  - "qrcode.react@4.2.0 dependency installed (named exports QRCodeSVG/QRCodeCanvas)"
  - "vendor-*.js bundle cap raised 600 -> 650 kB atomically with the dep install"
  - "6 RED Wave 0 test files covering R1-R7 (Nyquist validation contract)"
  - "convex/qrisPayments/__tests__/_factory.ts — inventory-seeding order + qrisPayments factories"
affects: [84-02-schema-xendit, 84-03-mutations, 84-04-webhook, 84-05-frontend]

# Tech tracking
tech-stack:
  added: [qrcode.react@4.2.0]
  patterns:
    - "Wave 0 RED scaffold: test files import not-yet-built modules and fail RED until later waves turn them GREEN"
    - "Non-vacuous idempotency test: factory seeds default storageLocation + packaging BOM + FIFO stock so reserveStockForOrderInternal actually decrements; replay reads reserved qty before/after"
    - "Pure-fn extraction (decideWebhookOutcome) sidesteps the convex-test t.action(internal.*) resolver bug; integration via t.run/t.mutation"

key-files:
  created:
    - convex/integrations/qris/__tests__/xendit.test.ts
    - convex/integrations/qris/__tests__/verifyToken.test.ts
    - convex/qrisPayments/__tests__/_factory.ts
    - convex/qrisPayments/__tests__/webhookTransition.test.ts
    - convex/qrisPayments/__tests__/mutations.test.ts
    - convex/qrisPayments/__tests__/createInvoice.test.ts
    - src/components/orders/__tests__/QrisChargeDialog.test.tsx
    - tests/e2e/qris-charge.spec.ts
  modified:
    - package.json
    - package-lock.json
    - vite.config.ts

key-decisions:
  - "Bundle cap bump and qrcode.react install landed in the SAME commit (pitfall #16)"
  - "Test files are NOT type-checked by npm run type-check / npm run build (tsconfig.app excludes src tests + convex tree), so RED imports do not break the build — no @ts-expect-error needed"
  - "Factory seeds a full reservable order (location + packaging componentType + FIFO batch + componentStock + orderItems) so the 84-03 idempotency replay is non-vacuous"

patterns-established:
  - "Wave 0 RED scaffold for a multi-plan phase: install deps + author all failing tests up front"
  - "readReservedQty(componentStock.totalReserved) as the before/after probe for reserve-once assertions"

requirements-completed: [R1, R2, R3, R4, R5, R6, R7]

# Metrics
duration: 13min
completed: 2026-05-21
---

# Phase 84 Plan 01: QRIS Wave 0 RED Scaffold Summary

**Installed qrcode.react@4.2.0 (cap bumped to 650 kB atomically), and authored 6 RED test files + an inventory-seeding factory covering R1–R7, including a non-vacuous reserve-once idempotency replay.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-05-21T15:59:00Z
- **Completed:** 2026-05-21T16:12:32Z
- **Tasks:** 3
- **Files modified:** 11 (8 created, 3 modified)

## Accomplishments
- `qrcode.react@4.2.0` installed; `vendor-*.js` bundlesize cap raised 600 → 650 kB in the same commit (pitfall #16, threat T-84-00 mitigated).
- All 6 Wave 0 test files authored and confirmed RED — every SPEC requirement R1–R7 now has a pre-existing automated test (Nyquist contract).
- `_factory.ts` seeds a complete reservable order so the 84-03 idempotency replay decrements real stock (staffreview C5 non-vacuity).
- `decideWebhookOutcome` pure-fn cases include the both-true reason (amount + superseded, C7) and the unmatched-COMPLETED no-op (C4).
- RTL test renders the ACTIVE pending state so `QRCodeSVG` is actually invoked (staffreview I5), plus all 3 roles mount (pitfall #19).

## Task Commits

1. **Task 1: Install qrcode.react + bump vendor cap** — `72a8185a` (chore)
2. **Task 2: RED pure-fn tests (R1 + R4a)** — `35133cb7` (test)
3. **Task 3: RED backend integration + factory + RTL + E2E** — `dfa44409` (test)

_All test tasks are RED-only commits — the GREEN/feat commits land in Plans 02–05._

## Files Created/Modified
- `package.json` / `package-lock.json` — added qrcode.react@4.2.0
- `vite.config.ts` — vendor cap 600 → 650 kB + updated comment
- `convex/integrations/qris/__tests__/xendit.test.ts` — R1 buildCreateQrBody body shape (imports only the pure fn, no env/fetch side effects — I1)
- `convex/integrations/qris/__tests__/verifyToken.test.ts` — R4a constant-time token compare (5 cases; missing header/config → false)
- `convex/qrisPayments/__tests__/_factory.ts` — makeAwaitingPaymentOrder (seeds default location + packaging BOM + FIFO stock + orderItems; returns expectedReserveQty), makeQrisPayment, readReservedQty
- `convex/qrisPayments/__tests__/webhookTransition.test.ts` — 5 pure decideWebhookOutcome cases (incl both-true C7) + non-vacuous reserve-once replay + unmatched no-op (C4)
- `convex/qrisPayments/__tests__/mutations.test.ts` — R2 insertPending/expirePrior/getActiveQrisPayment via t.run
- `convex/qrisPayments/__tests__/createInvoice.test.ts` — R3 guards (non-AwaitingPayment throws+writes-nothing; <1500 rejected)
- `src/components/orders/__tests__/QrisChargeDialog.test.tsx` — R5/R7 (3 roles mount, ACTIVE state invokes QRCodeSVG, reactive paid flip)
- `tests/e2e/qris-charge.spec.ts` — R6 happy path; live Test-Mode loop gated on XENDIT_API_KEY

## Decisions Made
- Bundle cap bump committed atomically with the dependency install (pitfall #16).
- No `@ts-expect-error` needed: `npm run type-check`/`npm run build` exclude `src/**/__tests__/**`, `src/**/*.test.*`, and the entire `convex/` tree, so RED imports of unbuilt modules do not break the build. The RED state is enforced purely under vitest.
- Factory seeds full inventory (default storageLocation + packaging componentType with `trackInventory:true` + FIFO `inventoryBatches` + `componentStock` aggregate + `orderItems`) so `reserveStockForOrderInternal` returns a real decrement, not `{reserved:0}`.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None. All test suites fail RED with the expected "Failed to resolve import" / "Could not find module for: qrisPayments/*" errors (targets land in Plans 02–05). Verified:
- `xendit.test.ts` → cannot resolve `../xendit`
- `verifyToken.test.ts` → cannot resolve `../webhooks`
- `webhookTransition.test.ts` → cannot resolve `../mutations`
- `mutations.test.ts` / `createInvoice.test.ts` → "Could not find module for: qrisPayments/mutations" (+ no qrisPayments table)
- `QrisChargeDialog.test.tsx` → cannot resolve `../QrisChargeDialog`

## User Setup Required
None in this plan. Xendit API key + webhook token + `QRIS_ENABLED` env vars are configured in later plans (84-02/84-04).

## Next Phase Readiness
- Plan 02 (schema + xendit.ts): add `qrisPayments` table + `businessSettings.qrisNmid`, run `npx convex codegen`, implement `buildCreateQrBody` → turns xendit.test.ts + factory inserts GREEN.
- Plan 03 (mutations): implement `insertPending`/`expirePrior`/`getActiveQrisPaymentInternal`/`recordPaidAndTransition`/`decideWebhookOutcome` → turns mutations/createInvoice/webhookTransition GREEN.
- Plan 04 (webhook): implement `verifyCallbackToken` + `handleXenditQrPayment` → turns verifyToken.test.ts GREEN.
- Plan 05 (frontend): implement `QrisChargeDialog` + `useQris` hooks → turns RTL + E2E GREEN.

## Self-Check: PASSED

- All 8 created files present on disk + vite.config.ts modified.
- All 3 task commits found in git log (72a8185a, 35133cb7, dfa44409).
- `npm ls qrcode.react` → qrcode.react@4.2.0.
- vite.config.ts contains `650 kB` and no longer contains `600 kB`.

---
*Phase: 84-qris-payment-integration*
*Completed: 2026-05-21*
