---
status: resolved
trigger: "GoFood Depot / Inventory pages: stock transfer to depot locations broken, GoFood depot page not in navbar, need 'Depot Management' dropdown grouping GoFood + K3Mart"
created: 2026-02-22T00:00:00Z
updated: 2026-02-22T00:00:00Z
---

## Current Focus

hypothesis: Three distinct issues found — all rooted in missing/incomplete wiring during Phase 19 implementation
test: Reading all relevant files to confirm hypotheses
expecting: Code evidence of each issue
next_action: Apply all three fixes atomically

## Symptoms

expected:
1. "Move" and "Receive" actions on Finished Goods tab should allow transferring stock to/from GoFood depot locations (Tamtem Depot, Legato Goldfinch)
2. GoFood Depot Management page (/gofood-depot) should be accessible from the navigation bar
3. GoFood Depot and K3Mart Cockpit should be grouped under a "Depot Management" dropdown in the nav

actual:
1. Can't move stock to GoFood depot locations — the locations may not appear in the transfer destination picker
2. GoFood Depot page has no navigation link — must type URL manually
3. GoFood and K3Mart are either missing or not grouped in navigation

errors: None (no runtime errors, just missing wiring)
reproduction: Navigate to nav, /inventory Finished Goods tab
started: Phase 19 implementation

## Eliminated

- hypothesis: Backend transferStock mutation is broken
  evidence: Mutation code looks correct — it accepts any storageLocation IDs as source/destination
  timestamp: 2026-02-22

- hypothesis: Route for /gofood-depot is missing
  evidence: Route IS wired in App.tsx (line 279-286)
  timestamp: 2026-02-22

- hypothesis: locationType "depot" is not in schema
  evidence: Schema DOES include v.literal("depot") — added in Phase 19
  timestamp: 2026-02-22

## Evidence

- timestamp: 2026-02-22
  checked: src/components/layout/Header.tsx
  found: mainNavItems array contains Sales, Orders, Kitchen, Inventory, K3 Mart, Dispatch. NO GoFood Depot entry. K3 Mart is a flat nav item (not in a dropdown group).
  implication: Issue #2 confirmed — GoFood Depot has no nav link. Issue #3 confirmed — no Depot Management dropdown.

- timestamp: 2026-02-22
  checked: src/hooks/convex/useStorageLocations.ts + convex/storageLocations/queries.ts
  found: useConvexStorageLocations(activeOnly) calls list query. The list query returns ALL active locations with no type filtering. Depot-type locations ARE returned.
  implication: Backend returns depot locations. Frontend receives them. Transfer picker uses this same list.

- timestamp: 2026-02-22
  checked: src/components/inventory/FinishedGoodsTab.tsx lines 864-868
  found: locationsForTransfer = (locations ?? []).map(l => ({ _id: l._id, name: l.name }))
  This is passed to InlineTransferForm as allLocations. ALL active locations including depot type.
  implication: Transfer form DOES show depot locations if they exist in DB. Issue #1 may be a data issue (depot locations don't exist yet) OR a UI filtering bug.

- timestamp: 2026-02-22
  checked: src/components/inventory/StockTransferModal.tsx
  found: The "Move Stock" modal receives locations prop from FinishedGoodsTab which passes (locations ?? []) — all active locations. No filtering by type. Depot locations will appear IF they exist in the DB.
  implication: The stock transfer modal itself is correct. If depot locations exist in the DB and are active, they will appear.

- timestamp: 2026-02-22
  checked: src/components/inventory/FinishedGoodsTab.tsx + useStorageLocations type
  found: StorageLocation type in useStorageLocations.ts defines locationType as "office" | "kitchen" | "venue" only. The "depot" type added to schema is NOT reflected in the TypeScript type.
  implication: TypeScript type mismatch but not a runtime bug — the query returns depot locations fine even with the type mismatch.

## Resolution

root_cause: |
  Three issues:
  1. STOCK TRANSFER: The InlineTransferForm and StockTransferModal receive all active storage locations correctly — depot locations WILL appear if they exist in DB. The issue is a missing TypeScript type ("depot" not in StorageLocation type). Not a functional bug, but a type issue.

  2. NAVIGATION: GoFood Depot page (/gofood-depot) is NOT in any nav array in Header.tsx. K3 Mart is a flat item in mainNavItems but should move to a "Depot Management" dropdown.

  3. DROPDOWN GROUPING: No "Depot Management" dropdown group exists in Header.tsx. The nav structure needs: a new dropdown group containing both K3 Mart (/k3mart-cockpit) and GoFood Depot (/gofood-depot).

fix: |
  1. Add "depot" to StorageLocation TypeScript type in useStorageLocations.ts
  2. Remove K3 Mart from mainNavItems
  3. Add new depotItems array with GoFood Depot + K3 Mart
  4. Add "Depot Management" dropdown in Header desktop nav and mobile sheet nav

files_changed:
  - src/components/layout/Header.tsx
  - src/hooks/convex/useStorageLocations.ts
