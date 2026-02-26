# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-02-25)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** v1.4 — Sales & Channel Integration

## Current Position

Phase: 27 of 30 (GrabFood POS Integration)
Plan: 2 of 3 complete
Status: In progress — 27-02 backend complete, proceeding to 27-03 frontend
Last activity: 2026-02-26 - Phase 27 Plan 02 complete (backend actions + mutations + webhooks)

Progress (v1.4): [██████████████░░░░░░] 70% — Phase 27 plan 2/3 done

## Performance Metrics

**Velocity (v1.0):** 36 plans, avg 6.3 min, ~3.8 hours total
**Velocity (v1.1):** 27 plans, avg 7.3 min, ~3.3 hours total
**Velocity (v1.2):** 20 plans (Phases 17, 17.1, 18)

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

Phase 26 established patterns (reference for Phases 27-30):
- [Phase 26]: externalSource validator exported from schema.ts — use for all new external tables/queries
- [Phase 26]: saveDirectToken is internalMutation — actions call via internal.platformCredentials.mutations.saveDirectToken
- [Phase 26]: IntegrationHealthCard accepts PlatformHealthStatus prop — extend syncHistory/health for new platforms
- [Phase 26]: Convex API path includes module file: api.platformCredentials.queries.X (not api.platformCredentials.X)
- [Phase 26]: api.d.ts must be manually updated when new Convex modules are added without running npx convex dev
- [Phase 26]: createSyncLog accepts syncType "token_refresh" — use for all token refresh paths
- [Phase 26]: GoBiz 2-step GoID auth: POST /goid/login/request (JSON) then POST /goid/token (JSON flat body)
- [Phase 26]: New files MUST be git-added — untracked files cause production deploy failures (grabfood/config.ts incident)

### Roadmap Evolution

- Phase 27.1 inserted after Phase 27: GrabFood Menu Simulator (URGENT)

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

Last session: 2026-02-26
Stopped at: Completed 27-02 backend. Plan 2/3 done. Ready for 27-03 frontend.
Resume file: None
Resume notes: Branch: gsd/phase-27-grabfood-pos-integration. Next: 27-03-PLAN.md (frontend GrabFoodManager page — Orders tab, Menu tab, store status). All backend actions and queries ready.
