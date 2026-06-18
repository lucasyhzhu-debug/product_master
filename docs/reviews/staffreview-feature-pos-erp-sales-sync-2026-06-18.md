# Triple Review — feature/pos-erp-sales-sync

**Date:** 2026-06-18
**Base:** d675f83f · **Reviewed head:** d9e29b84 (fixes landed at 0eed0ed6 + 71bc6651)
**Reviewers:** requirements-reviewer (feature-dev:code-reviewer) · code-quality-reviewer · staffreview (opus)
**Feature:** POS = 9th external revenue source (`source:"pos"`, platform `POS`). Hourly pull-sync → externalRevenue parents + per-line items; refunds → negative-gross parent-only returns; ship-dark deduction.

## Summary

High-fidelity, low-risk implementation. All 7 planned tasks landed; the source-literal cascade is complete and type-enforced; type-check + full suite (2125 pass) + build all green. The core data path (K3Mart-mirror: parent-only negative-gross refunds, existence-guarded children, `confidence:"exact"`, `collapseRevenuePeriod`) is correct. All material findings were in the contract-forward-compat and wiring/ops seam, not the core write path. Critical + Important findings fixed; spec/plan-mandated items adjudicated and left intentionally.

## Critical (fixed)

- **C1 — Runtime parse used `.strict()`, violating CONTRACT §8 forward-compat (CONSENSUS: requirements + staff, verified against CONTRACT line 169).** `sync.ts` parsed live pages with the same `.strict()` schemas as the fixture-lock test. CONTRACT §8 requires the runtime validator to use `.passthrough()` — the first additive (non-breaking) POS field would have thrown `ZodError`, logged `status:"error"`, and halted the hourly sync. **Fix (0eed0ed6):** added `*RuntimeSchema` passthrough variants used by `sync.ts`; kept `.strict()` schemas for the fixture-lock test; added a forward-compat test asserting the runtime schema accepts an extra key while strict rejects it. (Later deduped strict/passthrough field sets in 71bc6651.)

## Important (fixed)

- **I2 — Sync discarded `saveRevenueItemsWithCounts` counters.** `updateSyncLog` got only `status`/`durationMs`, dropping `{inserted,deducted,skipped}` → POS `externalSyncLogs` carried no item observability for the §9.4 reconcile. **Fix (0eed0ed6):** accumulate per-page counts; thread `productsCount`/`itemsDeducted`/`itemsSkipped` into the success `updateSyncLog` (mirrors K3Mart).
- **I3 — Registry POS metadata misrepresented auth.** `authStrategy:"pos_login"` + "auto-refreshed" copy + dead `envVarName:"POS_API_TOKEN"`. POS auth is a paste-only opaque bearer token with manual rotation (CONTRACT §2). **Fix (0eed0ed6):** `authStrategy:"paste_token"`, `envVarName:"POS_API_BASE_URL"`, reconnect/lifespan copy rewritten.
- **I-06 — `fixtures.ts` shipped as a registered Convex module.** **Fix (0eed0ed6):** moved to `__tests__/fixtures.ts`. (Note: Convex scans `__tests__/` too, so it still appears in `api.d.ts` but registers zero functions — no deployed effect; matches the project's `testHelpers`/`_factory` pattern.)
- **assertAdmin duplication (reuse + altitude consensus).** `checkpoint.ts:assertAdmin` was a 4th copy of the admin gate. **Fix (71bc6651):** reuse the shared `internal.platformCredentials.queries.validateAdminToken`; removed `assertAdmin` + its test.
- **Frontend hardcoded source unions (altitude).** `ProductMappingCard.tsx` + `useCountMappingImpact` hardcoded the 8→9 literal union. **Fix (71bc6651):** use the canonical `ExternalSource` type (already widely frontend-imported; D-13 decoupling applies to the *Platform display* seam, not the `ExternalSource` data literal).

## Refinements (adjudicated — intentionally NOT changed)

- **Cursor terminal-null behavior** (code-quality C-01, requirements I1): persist after each page only when non-null; terminal null leaves checkpoint at last non-null → the final page is re-fetched (idempotently) once per run until new data arrives. This is **spec §6.4-mandated** self-healing design; both reviewers acknowledged it's intended. Left as-is.
- **`adapter.ts` (`posAdapter`/`normalizeRefunds`) dead in the write path** (requirements C2, code-quality I-01): plan-mandated (Task 3) forward-scaffolding for the channel-spine deduction cutover (activates when `channelDeductionEnabled.pos` flips). `normalizeRefunds` returns `negatedTotal` (negative) which contradicts spec §5's "positive magnitude, sign via transactionType" — **a sign-convention decision to resolve at the deduction cutover, not at this ship-dark merge.** Left untouched; flagged for the cutover.
- **drain-loop `drainPhase` helper** (simplification): the two near-identical sales/refund loops could be extracted, but the refactor touches the safety-critical, spec-mandated cursor logic for a 2-instance dedup. Skipped as too risky for a /simplify drive-by; candidate for its own reviewed change.

## Deferred (out-of-plan-scope follow-ups, do NOT block ship-dark merge)

- **Manual-trigger UI button** (consensus): `triggerPosSync` (public action) shipped + admin-gated + tested, but has no admin-UI button (spec §6.5/§9 "drain-on-demand"). The plan's 7 tasks did not include UI wiring. During rollout, trigger via the Convex dashboard Functions tab or add a `useTriggerPosSync` hook + button as a fast follow.
- **§9.4 reconcile tooling**: an ops procedure; no POS-total-by-day query/export shipped. Out of plan scope.
- **End-to-end income-statement sign test**: no test asserts a `pos` return with `revenueGross:-45000` subtracts in the P&L rollup (the sign correctness rests on the `incomeStatement.ts:299` raw-sum, cited but not test-pinned end-to-end). Consider an aggregation test.

## Verification

`npm run type-check` ✓ · `npm run test` 2125 pass / 3 skip / 0 fail ✓ · `npm run build` ✓ (no bundle-cap violation). 68 POS-module tests green (contract lock incl. forward-compat, adapter, record builders, checkpoint, sync incl. dedup/refund-sign/cursor-resume).
