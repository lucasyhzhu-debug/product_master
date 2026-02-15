---
phase: 13-api-audit-auth
plan: 03
subsystem: ui
tags: [health-dashboard, token-countdown, sync-history, integration-monitoring, shadcn]

# Dependency graph
requires:
  - phase: 13-01
    provides: "getSyncHealthStatus, getSyncHealthAlert queries, tokenExpiresIn on credential status"
provides:
  - IntegrationHealthCard reusable component with status badge, token countdown, sync history
  - useSalesAnalytics hooks for sync health and credential monitoring
  - Redesigned settings tab with per-platform health cards
  - GoBiz token dialog with status display and instant verification
affects: [13-04, 13-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IntegrationHealthCard: reusable health card pattern with status/countdown/history/actions"
    - "30-second countdown interval for token expiry display"

key-files:
  created:
    - src/components/salesAnalytics/IntegrationHealthCard.tsx
    - src/hooks/convex/useSalesAnalytics.ts
  modified:
    - src/components/salesAnalytics/SettingsTab.tsx
    - src/components/salesAnalytics/GoBizTokenDialog.tsx
    - src/hooks/convex/index.ts

key-decisions:
  - "ScrollArea for sync history with max-h-40 -- keeps card compact while showing recent events"
  - "Manager role sees health cards but all action buttons hidden -- clean read-only view"
  - "Token countdown updates every 30 seconds via setInterval -- balances freshness vs overhead"

patterns-established:
  - "Health card pattern: status badge + token section + last sync + history + action buttons"
  - "Role-gated UI: canViewHealth (admin|manager) for display, isAdmin for controls"

# Metrics
duration: 4min
completed: 2026-02-15
---

# Phase 13 Plan 03: Integration Settings Dashboard Summary

**Per-platform health dashboard cards with token countdown, sync history, and role-gated controls replacing the old Accordion layout**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-15T10:44:56Z
- **Completed:** 2026-02-15T10:49:23Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- IntegrationHealthCard component with full health dashboard: status badge, token countdown, sync history, action buttons
- Settings tab redesigned from Accordion layout to card grid showing K3 Mart, GoBiz, and Internal health cards
- GoBiz token dialog enhanced with current status display (Active/Expired/No token) and instant verification after paste
- Role-based access: managers see health read-only, admins get Sync Now, Configure, and token controls

## Task Commits

Each task was committed atomically:

1. **Task 1: Integration health card component and hooks** - `026ed59` (feat)
2. **Task 2: Redesign settings tab and enhance GoBiz token dialog** - `ef9691d` (feat)

## Files Created/Modified
- `src/components/salesAnalytics/IntegrationHealthCard.tsx` - Reusable health card with status, countdown, history, actions
- `src/hooks/convex/useSalesAnalytics.ts` - Hooks wrapping getSyncHealthStatus, getSyncHealthAlert, enhanced credential status
- `src/hooks/convex/index.ts` - Barrel export for new sales analytics hooks
- `src/components/salesAnalytics/SettingsTab.tsx` - Redesigned from Accordion to IntegrationHealthCard grid
- `src/components/salesAnalytics/GoBizTokenDialog.tsx` - Added token status display, countdown, instant verification

## Decisions Made
- Used ScrollArea (max-h-40) for sync history to keep cards compact
- Token countdown updates every 30 seconds -- balances freshness vs overhead
- Manager role sees health cards but all action buttons (Sync Now, Configure) are hidden for clean read-only view
- Reused existing `useConvexCredentialStatus` query (which now includes `tokenExpiresIn`) rather than creating a new query -- simpler hook surface

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
- Pre-existing build error in untracked `ProductMappingTab.tsx` file (not part of this plan) causes `npm run build` to fail. Type check (`tsc --noEmit`) passes cleanly for all plan files. This is a pre-existing issue on the branch.

## User Setup Required
None -- no external service configuration required.

## Next Phase Readiness
- Settings page now shows full health dashboard per integration
- Token management UX complete for GoBiz with instant verification
- Ready for Plan 04 (if applicable) or Plan 05

---
*Phase: 13-api-audit-auth*
*Completed: 2026-02-15*
