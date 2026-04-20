# Channel Regression Fixtures (Phase 74.5.1 + 74.5.2)

**Purpose:** Pre/post refactor byte-identical regression snapshots per CONTEXT D-08
(74.5 parent context, inherited by 74.5.1 and 74.5.2).

Channel regression tests under `convex/productInventory/__tests__/` consume the
fixtures in this directory to prove that the post-refactor channel spine
(saveRevenueItems → processChannelSaleInternal) produces byte-identical output
to the pre-refactor paths (saveRevenue for K3Mart, processGofoodSales for
GoBiz) on happy-path inputs.

## Capture protocol

1. **Pull 5-10 recent prod payloads per source.** Use
   `npx convex logs --prod` with grep filters by source adapter.
   - K3Mart sync payloads — `convex/integrations/k3mart/adapter.ts` sync entry.
   - GoBiz/GoFood sync payloads — `convex/integrations/gobiz/adapter.ts` manual
     or auto sync entry.
   - K3Mart consignment settlement payloads — `convex/consignment/mutations.ts`
     `createSettlement` callers.
   - BigSeller sync payloads split by inner platform (shopee + tiktok).
2. **Redact PII** — customer names, phone numbers, addresses. KEEP: SKUs,
   product names, quantities, prices, timestamps, transaction IDs.
3. **Commit** as `{source}-{N}.json` — one payload per file.
   - Example layout: `k3mart-1.json`, `k3mart-2.json`, ..., `gobiz-1.json`,
     `consignment-1.json`, `bigseller-shopee-1.json`, `bigseller-tiktok-1.json`.
4. **Minimum per source:** 5. **Target:** 5-10 per source.
5. **Sources required:**
   - `k3mart` — sync adapter output (parent rows pre-refactor; parent+child rows
     post-refactor).
   - `gobiz` — GoFood sync payloads for processGofoodSales regression parity.
   - `consignment` — K3Mart consignment settlement payloads for collapsed-period
     invariant preservation.
   - `bigseller-shopee` — BigSeller aggregator split into Shopee per-platform rows.
   - `bigseller-tiktok` — same, split into TikTok rows.
6. **NOT required** in 74.5.1:
   - `grabfood` — adapter is a stub (OAuth `orders:read` not yet granted).
   - `internal` — has its own E2E harness covering the direct-order path.

## Re-capture cadence

**Mandatory** before any flag flip in 74.5.2 per CONTEXT D-08. Re-capture fresh
samples within 72 hours before each per-channel flip (Shopee → TikTok →
BigSeller → K3Mart → GoFood). This is the ONLY way to assert byte-identical
parity against what prod is actually producing at flip time.

## Consumer tests

- `convex/productInventory/__tests__/k3martRegression.test.ts` — K3Mart
  parent+child shape preservation, dedup, collapsed-period invariant.
- `convex/productInventory/__tests__/gofoodRegression.test.ts` — GoBiz
  normalize() shape parity vs processGofoodSales-derived field set. (Full
  retirement regression lives in 74.5.2.)
- Future: per-platform regression tests for BigSeller-shopee, BigSeller-tiktok,
  consignment. Added in 74.5.2 cutover plans.

## Fixture file shape

Each fixture SHOULD be a JSON file containing the EXACT raw payload captured
from the adapter's sync entry point, wrapped in a minimal envelope that
includes a `capturedAt` timestamp and a `notes` field:

```json
{
  "capturedAt": "2026-04-25T09:00:00Z",
  "notes": "Pre-74.5.1-cutover capture from prod K3Mart sync",
  "payload": {
    "transactions": [ ... ]
  }
}
```

Consumers destructure `.payload` and feed it to the adapter under test. The
adapter's output is then diff-compared against an inline expected-output
snapshot (in the same JSON file under `.expected`) or against the legacy-path
output captured in the same session.

## Scope (74.5.1 only)

This plan (74.5.1 Wave 0) creates the empty directory + this README. Fixture
capture itself is an operational task tracked outside the plan — it is NOT a
unit-test-scoped action and typically happens during UAT.
