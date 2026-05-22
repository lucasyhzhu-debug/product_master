---
phase: 84-qris-payment-integration
plan: 02
subsystem: payments
tags: [qris, xendit, schema, convex, adapter, tdd, btoa]

# Dependency graph
requires:
  - phase: 84-01 (Wave 0 RED scaffold)
    provides: "R1 RED test (xendit.test.ts) importing buildCreateQrBody; qrisPayments factory expectations"
provides:
  - "qrisPayments table (14 fields incl optional rawPayload) + by_order + by_externalId indexes"
  - "businessSettings.qrisNmid optional field"
  - "QrisProvider interface + CreateInvoiceResult (provider.ts)"
  - "xenditProvider impl + exported pure buildCreateQrBody (xendit.ts)"
affects: [84-03-mutations, 84-04-webhook, 84-05-frontend]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Adapter with NO module-top-level side effects: process.env + fetch read only inside methods so pure-fn imports execute nothing"
    - "Default Convex runtime auth: btoa(apiKey + ':') for Basic auth (key as username, empty password) — NOT Buffer, NOT 'use node'"
    - "Our-own 30-min expiry window (Date.now()+30min) rather than trusting Xendit's expires_at (staffreview R5)"

key-files:
  created:
    - convex/integrations/qris/provider.ts
    - convex/integrations/qris/xendit.ts
  modified:
    - convex/schema.ts
    - convex/_generated/api.d.ts

key-decisions:
  - "rawPayload added to qrisPayments now (staffreview R1) so Plan 04's A1/A2 raw-webhook-body mitigation has a schema-backed home — Convex rejects unschemaed fields"
  - "expiresAt is our own 30-min window, not Xendit's expires_at (staffreview R5)"
  - "auth/env read lives inside createInvoice/getStatus; module import has zero side effects so the R1 unit test imports buildCreateQrBody safely"

patterns-established:
  - "QrisProvider as a plain TS interface module shared by action + tests (no Convex registrations)"

requirements-completed: [R1, R2, R7]

# Metrics
duration: 3min
completed: 2026-05-21
---

# Phase 84 Plan 02: QRIS Schema + Xendit Adapter Summary

**Added the qrisPayments table (+ optional rawPayload) and businessSettings.qrisNmid, defined the provider-agnostic QrisProvider interface, and implemented the Xendit adapter with side-effect-free module init — turning the R1 buildCreateQrBody test GREEN.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-21T16:16:07Z
- **Completed:** 2026-05-21T16:19:11Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `qrisPayments` table with all 14 fields (incl. optional `rawPayload`), `status` union `pending|paid|expired`, and both `by_order` + `by_externalId` indexes. `expiresAt` documented as our own 30-min window, not Xendit's.
- `businessSettings.qrisNmid: v.optional(v.string())` added next to `npwp` — existing singleton docs unaffected.
- `npx convex codegen` regenerated `_generated/api.d.ts`; the new table surfaces in the typed dataModel (derived from `schema.ts`).
- `QrisProvider` + `CreateInvoiceResult` exported from `provider.ts` as a pure TS module (no Convex registrations), importable by both the action and tests.
- `xenditProvider` implements `QrisProvider`: `createInvoice` POSTs `/qr_codes`, `getStatus` GETs `/qr_codes/{id}`, both reading `process.env.XENDIT_API_KEY` + calling `fetch` INSIDE the method. Basic auth via `btoa(\`${apiKey}:\`)` (key as username, empty password), no `Buffer`, no `"use node"`.
- `buildCreateQrBody` exported as a pure fn returning `{ reference_id, external_id, type:"DYNAMIC", currency:"IDR", amount }` — R1 test GREEN (4/4).

## Task Commits

1. **Task 1: qrisPayments table + businessSettings.qrisNmid + codegen** — `dfd3d793` (feat)
2. **Task 2: QrisProvider interface (provider.ts)** — `28fe0c55` (feat)
3. **Task 3: xenditProvider + buildCreateQrBody (R1 GREEN)** — `3f884a77` (feat)

## TDD Gate Compliance
Task 3 was `tdd="true"`. The RED test (`convex/integrations/qris/__tests__/xendit.test.ts`) was authored in Plan 01 (commit `35133cb7`, `test(84-01)`), so the RED→GREEN sequence spans plans: RED gate satisfied by Plan 01's test commit, GREEN gate satisfied by this plan's `3f884a77` feat commit. No refactor needed (impl was minimal-and-correct on first pass). R1 now passes 4/4.

## Files Created/Modified
- `convex/schema.ts` — `qrisPayments` table + 2 indexes + `rawPayload`; `businessSettings.qrisNmid`
- `convex/_generated/api.d.ts` — regenerated via `npx convex codegen`
- `convex/integrations/qris/provider.ts` — `QrisProvider` + `CreateInvoiceResult`
- `convex/integrations/qris/xendit.ts` — `xenditProvider` + pure `buildCreateQrBody`

## Verification
- `npm run type-check` exits 0 (frontend tsc; convex tree excluded by config).
- `npx tsc --noEmit -p convex` reports NO errors in `qris/xendit.ts` or `qris/provider.ts` (remaining convex-tree errors are the Wave-0 RED test files for Plans 03–05, expected).
- `npm run test -- convex/integrations/qris/__tests__/xendit.test.ts` → 4 passed (R1 GREEN).
- Acceptance criteria confirmed: file contains `type:"DYNAMIC"`, `currency:"IDR"`, `"Basic " + btoa(`, `https://api.xendit.co/qr_codes`, `process.env.XENDIT_API_KEY` (inside methods); contains NO `Buffer`, NO `"use node"`, NO dynamic `import(`.

## Deviations from Plan
None - plan executed exactly as written.

## Codegen Note
`npx convex codegen` ran successfully and regenerated `_generated/api.d.ts` (the new `qrisPayments` table is reflected in the typed dataModel, which is derived generically from `schema.ts` — no string literal in `dataModel.d.ts` to grep). The codegen run prints TS2339/module-resolution errors for the Wave-0 RED test files (`qrisPayments/mutations`, `qrisPayments/__tests__/*`, `verifyToken.test.ts`) — these are the expected RED state for Plans 03–05 and do NOT indicate a codegen failure; the generated files were emitted (api.d.ts shows as modified).

## Issues Encountered
None.

## User Setup Required
None in this plan. `XENDIT_API_KEY` is consumed inside the adapter but is configured as a Convex env var in a later plan (84-04 / deploy).

## Next Phase Readiness
- Plan 03 (mutations): implement `insertPending`/`expirePrior`/`getActiveQrisPaymentInternal`/`recordPaidAndTransition`/`decideWebhookOutcome` against the new `qrisPayments` table → turns `mutations.test.ts`/`createInvoice.test.ts`/`webhookTransition.test.ts` GREEN.
- Plan 04 (webhook): implement `verifyCallbackToken` + `handleXenditQrPayment`; `rawPayload` field is now available for the A1/A2 raw-body store.
- The adapter (`xenditProvider`) and `buildCreateQrBody` are ready for the create-QR action (Plan 03 actions.ts).

## Self-Check: PASSED

- `convex/integrations/qris/provider.ts` and `convex/integrations/qris/xendit.ts` present on disk.
- `convex/schema.ts` contains `qrisPayments: defineTable(`, both indexes, `rawPayload`, and `qrisNmid`.
- All 3 task commits found in git log (dfd3d793, 28fe0c55, 3f884a77).
- R1 test passes 4/4.

---
*Phase: 84-qris-payment-integration*
*Completed: 2026-05-21*
