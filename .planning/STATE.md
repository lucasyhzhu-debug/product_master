# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-02-13)
**Core value:** Every concern resolved, build passes, no regressions
**Current focus:** Phase 3 — Tech Debt (executing in parallel)

## Current Position
Phase: 3 — Tech Debt (IN PROGRESS)
Current Plan: 01 of 04 (01, 03 complete)
Last completed: 03-01 (Quick Fixes QFIX-01 + QFIX-02)

## Phase Readiness

| Phase | Status | Blockers |
|-------|--------|----------|
| 1 — Test Infrastructure | COMPLETE (all 4 plans done) | None |
| 2 — Security & Docs | IN PROGRESS (plan 01 done) | None |
| 3 — Tech Debt | IN PROGRESS (plans 01, 03 done) | None |
| 4 — Bugs | Blocked | Phase 3 |
| 5 — Backend Factories | Blocked | Phase 1 |
| 6 — BOM Migration | Blocked | Phases 1, 5 |
| 7 — Query Optimization | Blocked | Phase 6 |
| 8 — Schema Cleanup | Blocked | Phases 6, 7 |
| 9 — Frontend Factories | Blocked | Phases 5, 6, 8 |
| 10 — Infrastructure | Blocked | Phases 1, 6, 8 |

## Parallel Opportunities
Phases 1, 2, and 3 can start immediately in parallel. Phase 4 follows Phase 3. Phase 5 follows Phase 1. All remaining phases are on the critical path.

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

---
*Last updated: 2026-02-13*
*Last session stopped at: Completed 03-01-PLAN.md*
