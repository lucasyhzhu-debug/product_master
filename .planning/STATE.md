# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-02-13)
**Core value:** Every concern resolved, build passes, no regressions
**Current focus:** Phase 5 — Backend Factories (IN PROGRESS)

## Current Position
Phase: 5 — Backend Factories (IN PROGRESS)
Current Plan: 01 of 03
Last completed: 05-01 (Foundation Wrappers)

## Phase Readiness

| Phase | Status | Blockers |
|-------|--------|----------|
| 1 — Test Infrastructure | COMPLETE (all 4 plans done) | None |
| 2 — Security & Docs | COMPLETE (all 2 plans done) | None |
| 3 — Tech Debt | COMPLETE (all 4 plans done) | None |
| 4 — Bugs | IN PROGRESS (1/2 plans done) | None |
| 5 — Backend Factories | IN PROGRESS (1/3 plans done) | None |
| 6 — BOM Migration | Blocked | Phases 1, 5 |
| 7 — Query Optimization | Blocked | Phase 6 |
| 8 — Schema Cleanup | Blocked | Phases 6, 7 |
| 9 — Frontend Factories | Blocked | Phases 5, 6, 8 |
| 10 — Infrastructure | Blocked | Phases 1, 6, 8 |

## Parallel Opportunities
Phases 1, 2, 3 COMPLETE. Phase 4 (Bugs) is now ready. Phase 5 follows Phase 1 (COMPLETE). Phases 4 and 5 can proceed in parallel. All remaining phases are on the critical path.

## Session History

| Date | Phase | Action | Notes |
|------|-------|--------|-------|
| 2026-02-13 | -- | Project initialized | 39 requirements, 10 phases, roadmap created |
| 2026-02-13 | 01 | Plan 04 complete | Voucher handling tests: 15 tests, 3 helpers |
| 2026-02-13 | 01 | Plan 02 complete | FIFO inventory tests: 20 tests, 4 helpers |
| 2026-02-13 | 01 | Plan 01 complete | Ball distribution tests: 25 tests, 4 helpers |
| 2026-02-13 | 01 | Plan 03 complete | Order lifecycle tests: 30 tests, 4 helpers. Phase 01 COMPLETE. |
| 2026-02-13 | 02 | Plan 01 complete | Env files untracked, .gitignore fixed, SECURITY.md created |
| 2026-02-13 | 03 | Plan 03 complete | Removed 12 unused schema indexes (QFIX-05) |
| 2026-02-13 | 03 | Plan 01 complete | Replaced "current-user" in 5 files, deleted KitchenView V1 + 11 orphans |
| 2026-02-13 | 03 | Plan 02 complete | getDisplayStatus() helper, deprecated status cleanup in 5 UI files |
| 2026-02-13 | 02 | Plan 02 complete | Git history scrub, TruffleHog scan, CONVEX_DEPLOY_KEY rotated. Phase 02 COMPLETE. |
| 2026-02-13 | 03 | Plan 04 complete | Deleted orders/mutations.ts shim, migrated 135 refs across 8 files. Phase 03 COMPLETE. |
| 2026-02-13 | 04 | Plan 01 complete | Stock shortage override dialog: English UX, reason input, expanded roles, audit trail |
| 2026-02-13 | 05 | Plan 01 complete | convex-helpers auth wrappers, query helpers, test auth helper, SessionProvider |

## Decisions
- Schema uses discountType "amount" (not "fixed") for fixed-value voucher discounts
- validateFinalPrice blocks orders with finalTotal <= 0 (no free orders via voucher)
- Indonesian locale formatting for minimum order error messages (dots not commas)
- Test FIFO logic directly via t.run() rather than through API mutations for focused unit testing
- Fixed pre-existing type error in createDefaultStorageLocation helper
- Used completeBalls mutation (not fillPendingOrders) as primary ball distribution test entry point
- Test helpers create both componentTypes and productionUnitTypes for bridge table compatibility
- All ball distribution fixtures use BOM system exclusively (no deprecated fields)
- cancel mutation does not release inventory reservations (only updateStatus with Cancelled does) -- documented gap
- updateStatus has no state machine enforcement (any status transition allowed) -- documented gap
- Used updateStatus for inventory release tests, cancel mutation for status/production tests
- Added .env.local.* glob to .gitignore (original patterns did not cover .env.local.production/.env.local.testing filenames)
- Used casual internal-team tone for SECURITY.md per user preference
- Documented 39 requireRole() usages across 11 files as token-in-args scope
- Removed 12 unused indexes (5 strong + 7 moderate) after grep-verified audit
- Kept inventoryBatches.by_location (1 active reference), productionTargetLogs.by_date (future audit use)
- Added inline QFIX-05 comments for audit trail on removed indexes
- Used user?.name ?? "unknown" fallback for inventory audit trail (not empty string)
- Removed /kitchen-legacy redirect route entirely since V1 is deleted
- Fixed pre-existing unused OrderStatus import in OrderHeader.tsx to unblock build
- Used Partial<Record> for STATUS_COLORS to safely remove deprecated entries
- Updated getStatusCategory() to route through getDisplayStatus() so all callers benefit automatically
- Added missing Boxed/Labeled statuses to OrderStatusPanel dropdown
- Used git-filter-repo (not BFG) for history scrub since Java not installed
- Cherry-picked 34 phase commits onto rewritten history (unpushed local work preserved)
- TruffleHog 2.2.1 secrets scan: 18 false positives, 0 real secrets found
- Used api.orders.mutations.index.X path (not domain-specific paths) for shim migration simplicity
- Override audit stores user-provided reason (not re-fetched shortage details) since reservation already succeeded with skipStockCheck
- Expanded stock override access to order_staff in addition to manager/admin
- Used regex parsing for structured shortage line display with raw line fallback
- Used customMutation role metadata pattern (3rd arg) for per-function role declarations -- roles declared at definition site, never over wire
- Generic "Unauthorized" error for all auth failures (no role/status details leaked)
- Custom useLocalStorage hook for SessionProvider (localStorage, not sessionStorage) for cross-tab persistence
- Auth token synced to malo_session_id localStorage key on all 5 state transitions (login, logout, mount valid, mount expired, server invalidation)

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01 | 02 | 5min | 2 | 2 |
| 01 | 04 | 4min | 2 | 2 |
| 01 | 01 | 7min | 2 | 2 |
| 01 | 03 | 8min | 3 | 2 |
| 02 | 01 | 5min | 2 | 3 |
| 03 | 03 | 5min | 1 | 1 |
| 03 | 01 | 6min | 2 | 17 |
| 03 | 02 | 7min | 2 | 5 |
| 02 | 02 | 14min | 3 | 2 |
| 03 | 04 | 4min | 2 | 11 |
| 04 | 01 | 7min | 2 | 5 |
| 05 | 01 | 8min | 2 | 6 |

---
*Last updated: 2026-02-13*
*Last session stopped at: Completed 05-01-PLAN.md*
