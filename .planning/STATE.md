---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: → v2.1 Interregnum
status: executing
stopped_at: Completed 83-07-PLAN.md (O1+O2 parallel fetch)
last_updated: "2026-05-22T16:30:00.000Z"
last_activity: 2026-05-22 -- Phase 83 plan 07 (O1+O2 parallel platforms + pages) executed
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 6
  completed_plans: 6
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-11)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** Phase 83 — bigseller-pagelist-refresh

## Current Position

Phase: 83 (bigseller-pagelist-refresh) — ALL PLANS EXECUTED
Plan: 6 of 6
Milestone: v2.0 SHIPPED 2026-05-11 (tag `v2.0`, last commit `ddb4da74`)
Status: Phase 83 all 6 plans executed — ready for triple-review + verification + merge
Next: triple-review / verify / merge Phase 83 (all 6 plans done)
Last activity: 2026-05-22 -- Phase 83 plan 07 (O1+O2 parallel platforms + pages) executed

Progress: [██████████] 100% (Phase 83: 6/6 plans)

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
- [Phase 83-03]: BigSeller token auto-refresh (D-03) — capture muctoken response header, accumulate freshest, persist ONCE at end of successful sync via updateToken (lastRefreshStatus="auto-refreshed-from-response"); pure shouldPersistRefreshedToken guard (skip empty/equal/auth-error) for unit-testability. Widened validator + schema union (Flag #1 — CONTEXT "no schema change" was wrong). 2-state freshness banner (D-04) driven by new PlatformHealthStatus.tokenExpiresAt (ms); built decodeMucTokenExp because health daysRemaining is integer-day granularity. D-02 orderState archival note folded into CHANGELOG. 6 commits, 13 files, all gates green.
- [Phase 83-04]: BigSeller sync O4 N+1 elimination (D-05, low-risk-first #1) — added getRevenueByIds batch internalQuery; fetchOrders prefetches the whole revenue batch ONCE after saveRevenue, both the revenue→order linking loop and the cross-platform leak guard (T-79-02) read from one in-memory map (~400 sequential getRevenueById calls eliminated per full-month sync). Flag #5 CONFIRMED: a raw Map is NOT a Convex-serializable return type (threw "Map ... is not a supported Convex type" over runQuery); switched to plan's Array<[id,doc]> fallback + caller-side new Map(entries). Pure refactor, leak guard preserved verbatim. 3 commits, 4 files, +2 tests (188 bigseller pass), build green.
- [Phase 83-06]: BigSeller sync O6 pageSize bump (D-05, low-risk-first #3) — raised BIGSELLER_PAGE_SIZE 50→100 in config.ts (halves page count per platform for a full-month sync), with an empirical-revert comment (revert to 50 if BigSeller returns code:-1). helpers.ts:61 buildPageListBody is the only consumer. Per lesson 83-01a the 3 HAR pageList fixtures + the helpers-test value assertion moved in lockstep (bare toHaveProperty("pageSize") strengthened to ("pageSize", 100)) keeping the fixture the single source of truth (T-83-06-02 mitigate). orderState assertions untouched (D-02). CHANGELOG records O6 + a 4-step revert runbook. No deviations. 3 commits, 6 files, 191 bigseller pass, build green.
- [Phase 83-07]: BigSeller sync O1+O2 parallel fetch (D-05, low-risk-first #5, highest-risk, done last) — Promise.all over platformShops (Shopee+TikTok concurrent, O1) + per-platform pages 2..N fanned out via new mapWithConcurrency chunked-Promise.all helper (cap 4, ordered by pageNo, O2). Page 1 stays sequential (readiness retry + page-1-fatal + reveals totalPage). Extracted fetchPage (single fetch+parse, RETURNS muctoken header — no concurrent shared write). Counts/token/auth RETURNED from processPlatform + aggregated post-Promise.all (single-threaded, T-83-07-01/03). Per-page 'storing' write collapsed to once-per-platform (no race). Page-1 fatal scoped per-platform (staffreview R2): sibling data lands, sync marked error naming the failing platform — deliberate change from all-or-nothing early-return. Leak guard T-79-02 preserved verbatim. +7 tests (198 bigseller pass): no-double-count, page-2-failure surfaces, leak-guard survival, token-under-concurrency, one-platform-page-1-fatal-scoped, cap-4. Plan-criterion note: 'Cross-platform leak guard' grep returns 2 not 1 (always did — comment + throw message); guard intact. Tasks 1+2 in one feat commit (interdependent rewrite, D-06 pairs them). 2 commits, 3 files, build green.
- [Phase 83-05]: BigSeller sync O3 adaptive polling (D-05, low-risk-first #2) — added pollDelayMs(pollAttempt) ramp helper in config.ts (15s x3 / 30s x2 / 60s thereafter); swapped all 4 pollSyncTask ctx.scheduler.runAfter reschedule sites in sync.ts from flat BIGSELLER_POLL_INTERVAL_MS to pollDelayMs(currentAttempt) — first poll uses pollDelayMs(0), 3 retry/not-complete branches use pollDelayMs(args.pollAttempt). BIGSELLER_MAX_POLLS unchanged at 8 → worst-case bound preserved (T-83-05-01 mitigated). Removed now-unused BIGSELLER_POLL_INTERVAL_MS import from sync.ts (Rule 3 noUnusedLocals; export kept in config.ts). Flag #3 confirmed: no literal 60s assertion existed — added NEW describe block in cron.test.ts locking the 15/15/15/30/30/60/60/60 ramp + <=60s ceiling + max-8. 3 commits, 4 files, +3 tests (191 bigseller pass), build green.
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

Last session: 2026-05-22T16:30:00.000Z
Stopped at: Completed 83-07-PLAN.md (O1+O2 parallel fetch) — all 6 Phase 83 plans executed
Resume file: None
