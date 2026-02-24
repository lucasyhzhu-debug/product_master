---
status: resolved
trigger: "Manager Overrides tab in VouchersManager crashes — flashes then redirects on first click, throws Convex server error on second click."
created: 2026-02-24T00:00:00Z
updated: 2026-02-24T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — `OverrideCard` in VouchersManager.tsx calls `useQuery` with `(api as any).vouchers.getOverrideOrderDetails`, but the correct Convex API path for a function in `vouchers/queries.ts` is `api.vouchers.queries.getOverrideOrderDetails`. The missing `.queries` sub-namespace causes the bad function reference, producing a Convex Server Error.
test: Read code confirmed the mismatch
expecting: Fix by changing the path to include `.queries.`
next_action: Apply fix to VouchersManager.tsx line 755

## Symptoms

expected: Clicking "Manager Overrides" tab in Voucher Management should show a list of manager override records
actual: First click — tab shows for ~1 second then page resets to the default Voucher Management view. Second click — throws a Convex server error: [CONVEX Q(vouchers:getOverrideOrderDetails)] Server Error. Also a ChunkLoadError is logged referencing the same Convex error.
errors: |
  Error: [CONVEX Q(vouchers:getOverrideOrderDetails)] [Request ID: e5c7e7460de48135] Server Error
    Called by client
    at Mt.queryResult (vendor-convex-CJsn7Bvj.js:2:11848)

  [ChunkLoadError] Retrying chunk load — same Convex error in cause
reproduction: Go to Voucher Management -> click "Manager Overrides" tab
started: Unknown — user just noticed it

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-02-24T00:00:00Z
  checked: convex/vouchers/queries.ts
  found: `getOverrideOrderDetails` is defined as a `query` export. Schema fields it accesses (orderNumber, orderDate, customerName, status, finalTotal) all exist in `orders` table.
  implication: The query itself is correct. Bug is not in the query implementation.

- timestamp: 2026-02-24T00:00:00Z
  checked: src/pages/VouchersManager.tsx line 754-756 (OverrideCard component)
  found: `useQuery((api as any).vouchers.getOverrideOrderDetails, ...)` — uses flat path missing `.queries.` sub-namespace
  implication: Since vouchers functions live in `vouchers/queries.ts`, the correct Convex API path is `api.vouchers.queries.getOverrideOrderDetails`. The flat path `api.vouchers.getOverrideOrderDetails` doesn't exist, causing a bad function reference → Convex Server Error.

- timestamp: 2026-02-24T00:00:00Z
  checked: src/hooks/convex/useVouchers.ts
  found: All other query calls use `vouchersApi.queries.*` pattern (e.g. `vouchersApi.queries.listOverrides`). The `vouchersApi` object is defined as `(api as any).vouchers` with a `queries` sub-object. This is the correct pattern.
  implication: The `OverrideCard` component bypassed the hook and used a wrong direct path. The fix is to use `.queries.` in the path.

## Resolution

root_cause: In `OverrideCard` (VouchersManager.tsx line 755), the Convex query was called via `(api as any).vouchers.getOverrideOrderDetails` — a flat path that doesn't exist. Since `getOverrideOrderDetails` lives in `vouchers/queries.ts`, the correct Convex API path is `api.vouchers.queries.getOverrideOrderDetails`. The missing `.queries.` sub-namespace produced a bad/null function reference, which Convex reported as a Server Error.
fix: Changed `(api as any).vouchers.getOverrideOrderDetails` to `(api as any).vouchers.queries.getOverrideOrderDetails` in OverrideCard component.
verification: `npm run type-check` passes (0 errors). `npm run build` passes (0 errors).
files_changed:
  - src/pages/VouchersManager.tsx (line 755: added `.queries.` to API path)
