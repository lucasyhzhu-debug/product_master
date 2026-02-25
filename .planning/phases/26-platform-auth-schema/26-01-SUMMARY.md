---
phase: 26-platform-auth-schema
plan: "01"
subsystem: platform-registry-schema
tags: [schema, registry, auth, external-integrations, grabfood, bigseller, consignment]
dependency_graph:
  requires: []
  provides: [grabfoodOrders-table, bigsellerOrders-table, consignmentOutlets-table, consignmentSettlements-table, externalSource-union, PlatformMeta-extended, getHealthStatusAll-query, decodeJwtPayload-shared]
  affects: [convex/schema.ts, convex/integrations/registry.ts, convex/platformCredentials/queries.ts, convex/platformCredentials/actions.ts]
tech_stack:
  added: []
  patterns: [registry-driven-health-check, shared-validator-export, jwt-shared-util]
key_files:
  created:
    - convex/lib/jwt.ts
  modified:
    - convex/integrations/registry.ts
    - convex/schema.ts
    - convex/platformCredentials/queries.ts
    - convex/platformCredentials/actions.ts
decisions:
  - "externalSource validator exported from schema.ts so integrations can import it without re-defining"
  - "GrabFood uses always_green healthCheckType but checks email (client_id) existence for disconnected state"
  - "bigseller token_expiry thresholds: green >7d, yellow 3-7d, red <3d — matching CONTEXT.md locked decisions"
  - "getHealthStatusAll requires manager/admin auth matching getCredentialStatusForManagers pattern"
  - "daysRemaining uses Math.ceil (rounds up) for label display — partial days count as full"
metrics:
  duration_minutes: 4
  tasks_completed: 4
  files_modified: 5
  completed_date: "2026-02-25"
---

# Phase 26 Plan 01: Platform Auth & Schema Foundation Summary

**One-liner:** Extended platform registry to 6 platforms with authStrategy/category/healthConfig, deployed 4 new schema tables (grabfoodOrders, bigsellerOrders, consignmentOutlets, consignmentSettlements), extended source unions in all 5 external tables, and created registry-driven credential health query requiring manager/admin auth.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 0 | Extract decodeJwtPayload to shared jwt.ts | 1199718 | convex/lib/jwt.ts (created), convex/platformCredentials/actions.ts |
| 1 | Extend platform registry with 6 platforms + PlatformMeta fields | 0f2fc12 | convex/integrations/registry.ts |
| 2 | Add 4 new schema tables + extend source unions in 5 existing tables | e071ef0 | convex/schema.ts |
| 3 | Create registry-driven credential health query | 0ffe356 | convex/platformCredentials/queries.ts |

## Verification Results

- [x] `npm run type-check` passes with no errors
- [x] `convex/lib/jwt.ts` exists and exports `decodeJwtPayload`
- [x] `convex/platformCredentials/actions.ts` imports from `../lib/jwt` (no local definition)
- [x] Registry exports 6 platforms with authStrategy, category, healthConfig fields
- [x] Schema has 4 new tables with all required indexes (including `by_linked_revenue` on order tables)
- [x] All 5 external tables use shared exported `externalSource` union (6 literals)
- [x] Only remaining `v.literal("k3mart")` is in the `externalSource` definition itself
- [x] `getHealthStatusAll` requires `token: v.string()` arg and calls `requireRole(["manager", "admin"])`
- [x] `getHealthStatusAll` returns `PlatformHealthStatus[]` with authStrategy, category, reconnectSteps fields

## Key Artifacts

### convex/lib/jwt.ts
Shared JWT payload decode utility. Exports `decodeJwtPayload(token: string): Record<string, unknown>`. Used by K3Mart login (actions.ts) and future BigSeller paste flow (Plan 02).

### convex/integrations/registry.ts
Extended with:
- `PlatformId`: 6 literals — k3mart, gobiz, internal, grabfood, bigseller, consignment
- New types: `AuthStrategy`, `PlatformCategory`, `DataType`, `HealthCheckType`, `HealthConfig`
- `PlatformMeta` extended with `authStrategy`, `category`, `healthConfig`; `dataTypes` widened to `DataType[]`
- 6 platform entries with full metadata

### convex/schema.ts
- Exported `externalSource` validator (6 literals) near top of file
- All 5 external tables (externalOutlets, externalRevenue, externalRevenueItems, externalSyncLogs, externalProductMappings) use shared `externalSource` instead of inline unions
- 4 new tables: `grabfoodOrders`, `bigsellerOrders`, `consignmentOutlets`, `consignmentSettlements`

### convex/platformCredentials/queries.ts
- New exported type `PlatformHealthStatus` — the single prop interface for Plan 03's `IntegrationHealthCard`
- New query `getHealthStatusAll` — iterates PLATFORMS registry, applies healthCheckType strategy:
  - `always_green`: internal/consignment always connected; grabfood checks email (client_id) presence
  - `last_sync`: k3mart/gobiz — green <=2d, yellow 2-7d, red >7d since last externalSyncLogs entry
  - `token_expiry`: bigseller — green >7d, yellow 3-7d, red <3d until tokenExpiresAt

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files Exist
- [x] `convex/lib/jwt.ts` — FOUND
- [x] `convex/integrations/registry.ts` — modified
- [x] `convex/schema.ts` — modified
- [x] `convex/platformCredentials/queries.ts` — modified
- [x] `convex/platformCredentials/actions.ts` — modified

### Commits Exist
- [x] 1199718 — feat(26-01): extract decodeJwtPayload to shared convex/lib/jwt.ts
- [x] 0f2fc12 — feat(26-01): extend platform registry with 6 platforms + PlatformMeta fields
- [x] e071ef0 — feat(26-01): add 4 new schema tables + extend source unions in 5 existing tables
- [x] 0ffe356 — feat(26-01): create registry-driven credential health query getHealthStatusAll

## Self-Check: PASSED
