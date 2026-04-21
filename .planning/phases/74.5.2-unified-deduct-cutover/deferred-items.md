# Phase 74.5.2 — Deferred Items

Out-of-scope issues discovered during execution. Per GSD SCOPE BOUNDARY rule, these
are NOT fixed by the discovering executor; they are logged for a follow-up plan or
the phase reviewer.

---

## 1. `convex/migrations/gofoodSaleToChannelSale.ts` — build errors (introduced in Plan 05 fix commit)

**Discovered by:** Plan 06 executor during `npm run build` verification gate.

**Introduced by:** `4408fab3 fix(74.5.2): add direct-handler test shims to gofoodSaleToChannelSale`
(merged into the 74.5.2 feature branch before Plan 06 started).

**Errors:**
```
convex/migrations/gofoodSaleToChannelSale.ts(76,24): error TS6133: 'args' is declared but its value is never read.
convex/migrations/gofoodSaleToChannelSale.ts(86,13): error TS7022: 'result' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
```

**Reproduction:**
```bash
git checkout 4d9c080c  # Wave 2 tip before Plan 06
npm ci && npm run build  # FAILS with both errors above
```

**Note:** `npm run type-check` passes (tsc --noEmit mode is more lenient on the
action `args` parameter). Only `npm run build` (which uses `tsc -b` composite-project
strict mode) fails.

**Impact on Plan 06 verification:**
- `npm run type-check`: ✅ PASS
- `npm run build`: ❌ FAIL — but NOT because of Plan 06 changes. The same failure
  occurs on base commit `4d9c080c` before any Plan 06 edits. Confirmed via
  `git stash && npm run build` on the base.

**Suggested fix (follow-up plan):**
```typescript
// In migrateGofoodSaleToChannelSale handler:
handler: async (ctx, _args): Promise<{           // rename args → _args
  totalMigrated: number;
  pagesProcessed: number;
}> => {
  // ...
  const result: { migrated: number; isDone: boolean; continueCursor: string | null } = await ctx.runMutation(  // explicit annotation
    internal.migrations.gofoodSaleToChannelSale.migrateOnePage,
    { paginationOpts: { numItems: PAGE_SIZE, cursor } },
  );
```

Or: consume `args.triggeredBy` in a console.log or audit record to use the parameter
genuinely.

**Suggested home:** Plan 10 (polish-and-docs) already touches 74.5.2 tidy-up;
add a single-paragraph task to fix these two errors before milestone close.

---

## Resolution — Plan 10 review (2026-04-21)

**Status:** Kept as-is. The `_args` rename + explicit `result` type annotation
(commit `4408fab3`) are the minimal correct fixes for the `tsc -b` build mode.
Revisiting in Plan 10 was considered but no cleaner refactor presented itself
(the `triggeredBy` arg is part of the public action contract and must stay in
the signature for scheduler invocation audit trails; the result-type annotation
breaks a legitimate tsc project-reference cycle — it IS the structural fix).
No code change made. Deferred item closed.

---

## 2. Sticker auto-deduction gap post GoFood flag-flip (quad-review C2)

**Discovered by:** Staff reviewer (quad-review, 2026-04-21).

**Summary:** Plan 08 deleted `processGofoodSales` (Phase D) AND `processSyncSales`
(Phase C — sticker/packaging auto-deduction). The unified `processChannelSaleInternal`
path does not yet BOM-resolve packaging components. After `channelDeductionEnabled.gobiz`
is flipped ON, every new GoFood sale will NOT auto-deduct stickers.

**Operational fallback (runbook-documented):**
- Monitor packaging inventory daily during the first week post-cutover.
- Manually deduct stickers via the admin inventory page using `productInventory:addAdjustment`
  with `reason: "sticker auto-deduct bridge — 74.5.2 cutover"` and a source rollup count.
- Frequency: batch-deduct daily based on `externalRevenueItems` count for the day
  (filter `source=gobiz`, sum over `quantity`).

**Follow-up candidate:** 74.5.3 or standalone phase — extend
`processChannelSaleInternal` to resolve `menuProductComponents` (category: `packaging`)
and emit a paired `packagingInventoryTransactions` entry per sale.

**Owner action:** create phase 74.5.3 backlog ticket.

---

## 3. Shim pattern governance (quad-review C3)

**Discovered by:** Staff reviewer (quad-review, 2026-04-21).

**Summary:** The `_fooForTest` direct-handler shim pattern (D74.5.2-L1) is now
present in 4 Convex source files (`channelAudit.ts`, `backfill.ts`, `gofoodSaleToChannelSale.ts`,
`consignment/queries.ts`). Shim bodies must stay in sync with registered handler
bodies manually — no compile-time or CI guard exists. Quad-review found one
instance of drift risk (`_backfillOnePageForTest` was a full copy-paste, fixed in
this pass by delegating to the shared `backfillOnePageImpl` helper).

**Follow-up candidates:**
- Document the pattern in `docs/TESTING_GUIDE.md` (when/why/how).
- Add a CI grep check: any `_fooForTest` export that is longer than ~3 lines
  AND does not delegate to a shared impl function is flagged for review.
- Investigate the root-cause convex-test module-resolver bug and file upstream.

**Owner action:** backlog ticket for TESTING_GUIDE update + CI check.

---

## 4. Migration drain-loop has no test coverage (quad-review I3 consensus)

**Discovered by:** Requirements reviewer + code-quality reviewer (quad-review).

**Summary:** `migrateGofoodSaleToChannelSale` internalAction drains pages via
`ctx.runMutation` in a loop with cursor threading. The test file's `_migrateGofoodSaleToChannelSaleForTest`
is a no-op stub (returns `{ totalMigrated: 0, pagesProcessed: 0 }`) because
convex-test cannot resolve the `internalAction` registration (same class of bug
as D74.5.2-L1). The cursor-threading logic is therefore un-tested.

**Mitigation:** single-page shim (`_migrateOnePageForTest`) IS covered; cursor
threading is simple pagination via Convex's own `paginate` API, which is
Convex-tested upstream.

**Follow-up candidate:** 74.5.3 — investigate convex-test action resolver;
OR write an integration test that dispatches via the registered action and
asserts completion by querying for zero remaining `gofood_sale` rows.

---

## 5. K3Mart bundle composite flip UI (D74.5.2-L14, quad-review I4 consensus)

**Discovered by:** Requirements reviewer + staff reviewer (quad-review).

**Summary:** CONTEXT decision D74.5.2-L14 specifies a single "Flip K3Mart (both paths)"
composite affordance on `ProductInventorySettings.tsx` that atomically sets both
`k3mart` and `consignment` flags. The flags exist and work individually; the
composite UI affordance is NOT shipped in Phase 74.5.2. Operators must remember
to flip both flags manually — if they flip only one, the K3Mart bundle invariant
is violated.

**Interim operational guidance:** flip both `k3mart` and `consignment` flags
together at `/admin/product-inventory-settings`; do not flip only one.

**Follow-up candidate:** 74.5.3 — add composite toggle button to ProductInventorySettings
that mutates both flags in a single `updateChannelDeductionFlags` call.

---

## 6. Token-in-query-args pattern (quad-review C1 from code-quality)

**Discovered by:** Code-quality reviewer.

**Summary:** `getSettlementItems` (and many existing admin queries) accept
`token: v.string()` as a query arg. Tokens passed to queries appear in Convex
dashboard logs and subscription payloads (browser devtools). The user's own
session token is visible to themselves — this is NOT a cross-user leak — but it
is a security smell.

**Scope:** Project-wide pattern, not 74.5.2-specific. Consistent with existing
consignment/external data queries.

**Follow-up candidate:** standalone security-review phase — migrate admin auth
from query args to cookie/session or to a prefetch-ticket pattern.

