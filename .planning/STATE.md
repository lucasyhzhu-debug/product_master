# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-02-25)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** v1.4 — Sales & Channel Integration

## Current Position

Phase: 26 of 30 (Platform Auth & Schema Foundation)
Plan: 2 of 3 complete
Status: In Progress — Plans 01-02 complete, Plan 03 remaining
Last activity: 2026-02-25 — Plan 02 complete (3 tasks + 1 deviation fix, 4 commits, 8 min)

Progress (v1.4): [████████░░░░░░░░░░░░] 40% — Phase 26 in progress (2/3 plans done)

## Performance Metrics

**Velocity (v1.0):** 36 plans, avg 6.3 min, ~3.8 hours total
**Velocity (v1.1):** 27 plans, avg 7.3 min, ~3.3 hours total
**Velocity (v1.2):** 20 plans (Phases 17, 17.1, 18)

## Accumulated Context

### Decisions

All v1.0–v1.3 decisions archived in PROJECT.md Key Decisions table.

Key decisions affecting v1.4 phases:
- [v1.4 arch]: No cron jobs — all data syncs are manual-trigger only (button press)
- [v1.4 arch]: GoBiz uses password grant endpoint for one-click refresh — no browser paste
- [v1.4 arch]: BigSeller paste-once JWT, 30-day expiry with < 5 day warning
- [v1.4 arch]: GrabFood resolveToken() on-demand, already scaffolded in adapter.ts
- [v1.4 arch]: Consignment is manual settlement entry form — no Excel upload, no SheetJS
- [v1.4 arch]: No bigsellerDailyStats table — derive aggregates from per-order data
- [v1.4 arch]: Extend existing credential health panel in Sales Analytics Settings
- [Phase 26]: Schema must deploy before Phases 27-30 — grabfoodOrders, bigsellerOrders, consignmentOutlets, consignmentSettlements; source union in ALL 4 tables
- [Phase 26-platform-auth-schema]: externalSource validator exported from schema.ts for shared use across integrations
- [Phase 26-platform-auth-schema]: getHealthStatusAll query requires manager/admin auth matching getCredentialStatusForManagers pattern
- [Phase 26-platform-auth-schema]: bigseller token_expiry thresholds: green >7d, yellow 3-7d, red <3d per CONTEXT.md
- [Phase 26-02]: saveDirectToken converted to internalMutation; saveDirectTokenPublic wrapper for frontend callers
- [Phase 26-02]: saveDirectToken uses updatedBy: 'system' for internal callers with no user context
- [Phase 26-02]: GoBiz loginWithCredentials wraps Bearer prefix around raw access_token from password grant
- [Phase 26-02]: BigSeller muc_token stored as currentToken (not refreshToken) — it is the primary access credential
- [Phase 26-02]: externalData/queries.ts uses shared externalSource validator from schema.ts (not local 3-literal union)

### Pending Todos

- [grabfood-pos-api-integration] GrabFood POS API integration — POC committed, full integration is Phase 27

### Blockers/Concerns

- [Phase 27]: Confirm whether Crystal/Goldfinch/Tamtem GrabFood outlets share one credential or need separate client_id/client_secret per outlet — must resolve before Phase 27 Wave 1 backend
- [Phase 27]: GrabFood grabItemID values per outlet needed before menu toggle can be activated — obtain from GrabFood portal or via API product listing
- [Phase 28]: BigSeller API is reverse-engineered (MEDIUM confidence) — verify taskStatus values, code:-1 behavior, and pageList pagination against live Frollie account before finalizing adapter
- [Phase 28]: BigSeller COGS = 0 for all current Frollie orders — profit margin analytics are meaningless until COGS configured in BigSeller; surface caveat prominently in UI

## Session Continuity

Last session: 2026-02-25
Stopped at: Completed 26-02-PLAN.md — saveDirectToken as internalMutation, GoBiz loginWithCredentials, BigSeller previewBigSellerToken + saveBigSellerToken
Resume file: None
Resume notes: Phase 26, Plan 03 next (credential management UI — health panel + auth dialogs).
