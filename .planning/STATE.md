---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Sales & Channel Integration
status: in-progress
last_updated: "2026-02-28T15:58:37.664Z"
progress:
  total_phases: 19
  completed_phases: 15
  total_plans: 68
  completed_plans: 67
---

# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-02-25)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** v1.4 — Sales & Channel Integration

## Current Position

Phase: 29.1 of 30 (Test Suite Repair — INSERTED)
Plan: 1 of 1 complete
Status: Phase 29.1 Complete — test suite repaired (0 failures, 633 passing)
Last activity: 2026-02-28 - Phase 29.1 Plan 01 complete (test suite repair, E2E exclusion, assertion fixes)

Progress (v1.4): [███████████████████░] 97% — Phase 29 + 29.1 complete, Phase 30 remaining

## Performance Metrics

**Velocity (v1.0):** 36 plans, avg 6.3 min, ~3.8 hours total
**Velocity (v1.1):** 27 plans, avg 7.3 min, ~3.3 hours total
**Velocity (v1.2):** 20 plans (Phases 17, 17.1, 18)

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 29.1 | 01 | 13 min | 6 | 8 |

## Accumulated Context

### Decisions

All v1.0–v1.3 decisions archived in PROJECT.md Key Decisions table.

Key decisions affecting v1.4 phases:
- [v1.4 arch]: No cron jobs — all data syncs are manual-trigger only (button press)
- [v1.4 arch]: Consignment is manual settlement entry form — no Excel upload, no SheetJS
- [v1.4 arch]: No bigsellerDailyStats table — derive aggregates from per-order data

Phase 27-01 decisions (API discovery gate):
- [Phase 27-01]: Gate PASS — token resolves, store status 200, menu batch reachable (400 = expected with empty payload)
- [Phase 27-01]: Single-credential model — one client_id/client_secret, all outlets via merchantID parameter
- [Phase 27-01]: Orders endpoint 401 = OAuth2 scope issue (not credential failure) — needs orders:read scope grant from GrabFood support
- [Phase 27-01]: No /merchants listing endpoint in GrabFood Partner API v1.1.3 — merchantIDs from Merchant Portal or live order webhooks
- [Phase 27-01]: IDR price handling — store as integer (no /100 division); currency.exponent=0 expected for IDR

Phase 27-02 decisions (backend implementation):
- [Phase 27-02]: Revenue bridge creates externalRevenue per grabfoodOrders insert (source: grabfood, dedup on orderID)
- [Phase 27-02]: IDR prices stored as-is (integer, no /100 division) — confirmed by exponent=0
- [Phase 27-02]: Webhook HMAC uses Web Crypto API (not Node crypto) — httpAction is non-Node runtime
- [Phase 27-02]: syncOrders 401 returns descriptive error (OAuth2 scope gap) without crashing
- [Phase 27-02]: Two-step menu update: PUT batch/menu then POST menu notification

Phase 27.1-01 decisions (webhooks):
- [Phase 27.1-01]: Shared syncType validator in schema.ts prevents schema/mutation/type drift
- [Phase 27.1-01]: HMAC secret sourced from platformCredentials table (not env vars) for httpAction compatibility
- [Phase 27.1-01]: Order webhook is log-only (no grabfoodOrders writes) per user decision
- [Phase 27.1-01]: Missing signature header returns valid=true (GrabFood may not always send it)

Phase 27.1-02 decisions (partner config UI):
- [Phase 27.1-02]: CONVEX_SITE_URL derived from VITE_CONVEX_URL by replacing .cloud with .site
- [Phase 27.1-02]: Clipboard copy wrapped in try/catch for non-HTTPS fallback
- [Phase 27.1-02]: Product availability defaults to true when isAvailable is undefined
- [Phase 27.1-02]: GrabFood price uses onBlur commit pattern for inline editing

Phase 28-01 decisions (sync backend):
- [Phase 28-01]: externalSource extended with shopee/tiktok (revenue source labels only, NOT added to registry -- prevents phantom health cards)
- [Phase 28-01]: bigsellerSyncState uses 'stage' field (not 'phase') to avoid confusion with GSD phase numbers
- [Phase 28-01]: HTML auth failure detection at every API call point (triggerSync, pollSyncTask, fetchOrders)
- [Phase 28-01]: Scheduler-chain pattern: ctx.scheduler.runAfter(60s) for polling, auto-retry once on timeout
- [Phase 28-01]: Revenue bridge uses actual platform source (shopee/tiktok), NOT "bigseller" aggregator name

Phase 28-02 decisions (frontend sync UI):
- [Phase 28-02]: api.d.ts manually updated with bigsellerOrders and bigseller sync/queries modules (regenerated on next npx convex dev)
- [Phase 28-02]: Retroactive BigSeller mapping added inline to updateProductMapping mutation (not separate action call)
- [Phase 28-02]: CSS variable tokens with fallbacks for status colors in orders table (--color-status-error, --color-status-success)
- [Phase 28-02]: Union type narrowing via 'in' operator for getSyncState return type

Phase 27.2-01 decisions (menu simulator backend):
- [Phase 27.2-01]: Kept batchUpdateAvailability as deprecated wrapper calling pushMenuChanges for backwards compatibility
- [Phase 27.2-01]: updatePushState is internalMutation called by pushMenuChanges action to track last-pushed state
- [Phase 27.2-01]: Webhook returns ALL items including unavailable with correct availableStatus (GrabFood needs this to re-show items)
- [Phase 27.2-01]: grabfoodMenuItems as override layer over menuProducts (core data unchanged, GrabFood-specific overrides in new table)

Phase 27.2-02 decisions (menu simulator frontend):
- [Phase 27.2-02]: GrabFood green color added as CSS variable --color-grabfood in index.css for theme consistency
- [Phase 27.2-02]: Diff tracking uses persisted lastPushed* fields (survives page reloads) rather than ephemeral React state
- [Phase 27.2-02]: Photo upload uses Convex generateUploadUrl + fetch POST pattern with client-side 5MB validation
- [Phase 27.2-02]: Merchant ID hardcoded as 6-C7XYAECCTNKXJ6 in PushConfirmDialog per user decision

Phase 29-01 decisions (consignment backend):
- [Phase 29-01]: Merged dispatchConsignmentOutlets into consignmentOutlets with optional dispatch planner fields
- [Phase 29-01]: Event auto-archive: only event-type outlets auto-deactivate on markAsPaid (immediate, not end-of-day)
- [Phase 29-01]: Revenue bridge: one externalRevenue per settlement, synced on update, deleted on delete
- [Phase 29-01]: All consignment mutations require admin or manager role
- [Phase 29-01]: Settlement math in pure helpers for testability (computeSettlementMath, shouldAutoArchive, etc.)

Phase 26 established patterns (reference for Phases 27-30):
- [Phase 26]: externalSource validator exported from schema.ts — use for all new external tables/queries
- [Phase 26]: saveDirectToken is internalMutation — actions call via internal.platformCredentials.mutations.saveDirectToken
- [Phase 26]: IntegrationHealthCard accepts PlatformHealthStatus prop — extend syncHistory/health for new platforms
- [Phase 26]: Convex API path includes module file: api.platformCredentials.queries.X (not api.platformCredentials.X)
- [Phase 26]: api.d.ts must be manually updated when new Convex modules are added without running npx convex dev
- [Phase 26]: createSyncLog accepts syncType "token_refresh" — use for all token refresh paths
- [Phase 26]: GoBiz 2-step GoID auth: POST /goid/login/request (JSON) then POST /goid/token (JSON flat body)
- [Phase 26]: New files MUST be git-added — untracked files cause production deploy failures (grabfood/config.ts incident)

Phase 29.1-01 decisions (test suite repair):
- [Phase 29.1]: Deleted 3 test files (recipes, tags, products) — modules removed in Phase 22, tests unfixable
- [Phase 29.1]: 100% discount now valid business case — voucher tests updated to positive assertions
- [Phase 29.1]: getWeeklyDispatchPlans returns Record not Array — test assertions updated

### Roadmap Evolution

- Phase 27.1 inserted after Phase 27: GrabFood Webhooks & Partner Configuration (URGENT)
- Phase 27.2 inserted after Phase 27.1: GrabFood Menu Simulator (URGENT, depends on 27.1)
- Phase 29.1 inserted after Phase 29: Test Suite Repair (56 failures from Phase 22 module removals)

### Pending Todos

- [grabfood-pos-api-integration] GrabFood POS API integration — POC committed, full integration is Phase 27

### Blockers/Concerns

- [Phase 27 - RESOLVED]: Single-credential model confirmed — one client_id/client_secret for all outlets, differentiated by merchantID parameter
- [Phase 27 - OPEN]: Orders endpoint returns 401 (OAuth2 scope gap) — contact GrabFood developer support to request orders:read scope grant; Phase 27-02 must handle 401 gracefully
- [Phase 27 - OPEN]: Crystal and Tamtem GrabFood merchantIDs still needed — only GFSBPOS-254-353 confirmed; admin must obtain remaining from GrabFood Merchant Portal
- [Phase 27]: GrabFood grabItemID values per outlet needed before menu toggle can be activated — obtain from GrabFood portal or via API product listing
- [Phase 28]: BigSeller API is reverse-engineered (MEDIUM confidence) — verify taskStatus values, code:-1 behavior, and pageList pagination against live Frollie account before finalizing adapter
- [Phase 28]: BigSeller COGS = 0 for all current Frollie orders — profit margin analytics are meaningless until COGS configured in BigSeller; surface caveat prominently in UI

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 29 | Add sync history entries for platform token refreshes | 2026-02-25 | 01071c3 | Verified | [29-add-sync-history-entries-for-platform-to](./quick/29-add-sync-history-entries-for-platform-to/) |

## Session Continuity

Last session: 2026-02-28
Stopped at: Completed 29.1-01-PLAN.md (test suite repair)
Resume file: .planning/phases/29.1-test-suite-repair/29.1-01-SUMMARY.md
Resume notes: Phase 29.1 complete (1/1 plan). Test suite green (633 tests, 0 failures). All Phases 26-29.1 complete. Next: Phase 30 (Unified Sales Analytics).
