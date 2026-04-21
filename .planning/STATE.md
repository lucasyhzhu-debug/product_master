---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Financial Management & Data Quality
status: executing
stopped_at: Completed 74.5.2-10-polish-and-docs-PLAN.md — Phase 74.5.2 at 10/10 plans, ready for verifier/merge
last_updated: "2026-04-21T05:26:33.723Z"
last_activity: 2026-04-21
progress:
  total_phases: 21
  completed_phases: 14
  total_plans: 70
  completed_plans: 65
  percent: 93
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-08)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** Phase 74.5.2 — unified-deduct-cutover

## Current Position

Phase: 74.5.2 (unified-deduct-cutover) — EXECUTING
Plan: 2 of 10
Status: Ready to execute
Last activity: 2026-04-21

Progress: [████████▌░] 84%

## Performance Metrics

**Velocity (v1.0-v1.9):** 246 plans across 69 phases in 10 milestones

## Accumulated Context

### Decisions

All v1.0-v1.9 decisions archived in PROJECT.md Key Decisions table.
No new decisions yet for v2.0.

- [Phase 70.1]: Pre-existing implementation verified and tested; 6 backend tests added for listAllExpenses admin query
- [Phase 80.2]: Phase 80.2 Plan 01: K3Mart retroactive cascade via by_source_productCode index + sync-time linkedMenuProductId attachment via action->query bridge
- [Phase 80.2]: Phase 80.2 Plan 02: Paginated-WRITE backfill mutation + self-heal guard — repairs 219 orphan Direct externalRevenue parents, fixes syncInternalOrders:126 unconditional skip (first paginated-WRITE mutation pattern in convex/)
- [Phase 80.2]: Plan 03 Wave 3: Replaced plan's skuPareto reference with consolidated skuSnapshot.skuTop (Phase 80.1 refactor); used novel convex-test t.action() pattern for syncInternalOrders guard-swap test (no fallback needed).
- [Phase 80.2]: Plan 04 partially executed (Task 4.1 + 4.10 auto); Tasks 4.2-4.9 + 4.11-4.12 pending human verification (prod access, admin tokens, UI check, merge authority)
- [Phase 74.5.2]: Plan 01: channelAudit.test.ts 4 red `t.action(internal.*)` failures fixed via direct-handler invocation (new `_runFullAuditForTest` helper in channelAudit.ts) — matches known-green channelSale.test.ts pattern; BigSeller normalize fixture tightened to `Extract<ExternalSource, ...>` per D74.5.2-L2
- [Phase 74.5.2]: Plan 02: Added `by_source_deductedAt` compound index on `externalRevenueItems` + created `convex/productInventory/backfill.ts` with 4 exports (backfillOnePage / backfillChannelDeductions / runChannelBackfill / getChannelBackfillPreflight). Admin-gated, flag-independent (D74.5.2-L13), preserves revenue.transactionDate as createdAt (D-16), set-once idempotency via inventoryDeductedAt patched ONLY on result.deducted===true (D-19), silent-drop guard for null linkedMenuProductId (D74.5.2-L4), 100K row runaway cap via MAX_ITERATIONS=500.
- [Phase 74.5.2]: Plan 03: 8 regression tests for backfill.ts (idempotency, timestamp preservation, D74.5.2-L4 silent-drop guard, admin gate, D74.5.2-L13 flag-independence, per-source isolation, 200+ item chunking, preflight per-source audit gate). Applied Plan 01 / D74.5.2-L1 precedent: convex-test's module resolver fails for t.mutation(internal.*) / t.query(api.*) against the productInventory subtree; fixed by adding _backfillOnePageForTest / _runChannelBackfillForTest / _getChannelBackfillPreflightForTest test-only direct-handler exports to backfill.ts (mirrors channelAudit.ts _runFullAuditForTest).
- [Phase 74.5.2]: Plan 10: Task 1 (lint polish on AuditIssueTypeBadge + ChannelRoutingManager) was a no-op — both files already lint-clean from 74.5.1 triple-review commit bf036387. Documented as (No-op) entries in CHANGELOG Fixed section. Task 2 shipped comprehensive docs sweep: CHANGELOG + SCHEMA + API_REFERENCE + ROADMAP. Bonus scope: closed deferred-items.md tsc -b entry via appended Resolution section (kept existing _args + explicit result type annotation as structural fix).

### Open Blockers (carried forward)

- GrabFood `orders:read` OAuth2 scope not yet granted -- infrastructure works, 401 handled gracefully
- Crystal and Tamtem GrabFood merchantIDs pending -- only GFSBPOS-254-353 confirmed
- GrabFood grabItemID values per outlet needed for menu toggle activation
- BigSeller COGS = 0 for all Frollie orders -- profit analytics meaningless until configured

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260409-paq | Align production targets toggles with production components - tier-1 as pieces, leaf as grams, unify kitchen components source | 2026-04-09 | db926233 | Verified | [260409-paq-align-production-targets-toggles-with-pr](./quick/260409-paq-align-production-targets-toggles-with-pr/) |
| Phase 70.1 P01 | 4min | 2 tasks | 1 files |
| 260411-ovn | Add editable paid date to consignment Paid button | 2026-04-11 | 60dd66e5 | Verified | [260411-ovn-add-editable-paid-date-to-consignment-pa](./quick/260411-ovn-add-editable-paid-date-to-consignment-pa/) |
| 260416-jm7 | Fix 17 test debt failures per spec (gobizAdapter, k3martCockpit, bigsellerOrders, csvImportValidation) | 2026-04-16 | ea63000b | Verified | [260416-jm7-fix-17-test-debt-failures-per-planning-s](./quick/260416-jm7-fix-17-test-debt-failures-per-planning-s/) |
| 260417-hyv | Simplify nav bar: collapse to 5 top-level slots (Dashboards / Orders / Ops / Finance / Config) | 2026-04-17 | 0530a610 | Verified | [260417-hyv-move-sales-analytics-into-dashboards-mov](./quick/260417-hyv-move-sales-analytics-into-dashboards-mov/) |
| Phase 80.2 P01 | 7min | 4 tasks | 5 files |
| Phase 80.2 P02 | 13min | 4 tasks | 5 files |
| Phase 80.2 P03 | 8min | 5 tasks | 5 files |
| Phase 80.2 P04 | 10min | 2 tasks | 6 files |
| Phase 74.5.2 P03 | 12 | 1 tasks | 2 files |
| Phase 74.5.2 P10 | 14 | 2 tasks | 5 files |

### Roadmap Evolution

- Phase 70.1 inserted after Phase 70: Admin All-Expenses Visibility (URGENT)
- Phase 1000 added 2026-04-17: Unified Channel Integration Architecture (promoted from backlog 999.4, folded in 999.5). Spec + implementation plan pre-written via superpowers:brainstorming + writing-plans; committed on `feature/999.4-channel-integration-spec`. See `docs/superpowers/specs/2026-04-17-*-design.md` and `docs/superpowers/plans/2026-04-17-*.md`.

### Research Flags

- Phase 70 (Revenue Fix): Need to trace exact failure mode in syncInternalOrders action
- Phase 72 (Bank Parser): BCA/Mandiri CSV format details LOW confidence; need actual exported CSV files

## Session Continuity

Last session: 2026-04-21T05:26:33.717Z
Stopped at: Completed 74.5.2-10-polish-and-docs-PLAN.md — Phase 74.5.2 at 10/10 plans, ready for verifier/merge
Resume file: None
