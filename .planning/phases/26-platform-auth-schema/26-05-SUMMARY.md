---
phase: 26-platform-auth-schema
plan: "05"
subsystem: sales-analytics
tags: [platform-health, sync-history, collapsible-ui, uat-gap-closure]
dependency_graph:
  requires: [26-03]
  provides: [expandable-sync-log-ui]
  affects: [sales-analytics-settings-tab]
tech_stack:
  added: []
  patterns: [collapsible-local-state, registry-driven-query-enrichment]
key_files:
  created: []
  modified:
    - convex/platformCredentials/queries.ts
    - src/components/salesAnalytics/IntegrationHealthCard.tsx
decisions:
  - "syncHistory initialized as [] before branch logic so always_green and token_expiry platforms automatically get empty array without extra code"
  - "syncHistory variable scoped outside if/else branches so single results.push() covers all three platform types cleanly"
  - "Expand toggle hidden via hasSyncHistory guard — only K3Mart and GoBiz cards show the chevron"
  - "SettingsTab unchanged — already passes full health object, syncHistory flows through transparently"
metrics:
  duration_minutes: 4
  tasks_completed: 2
  files_modified: 2
  completed_date: "2026-02-25"
requirements: [AUTH-03, AUTH-04]
---

# Phase 26 Plan 05: Sync History Expand-to-Log Summary

**One-liner:** Restored clickable expand behavior on K3Mart and GoBiz platform cards, showing last 5 sync log entries with status icon, relative timestamp, record count, and error message.

## What Was Built

Platform cards in the Sales Analytics Settings tab (K3Mart, GoBiz) now show a ChevronDown/Up toggle. Clicking expands a sync history section below the row with up to 5 recent entries from `externalSyncLogs`. Internal, Consignment, GrabFood, and BigSeller cards show no toggle (their `syncHistory` is always `[]`).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add SyncLogEntry type and syncHistory to PlatformHealthStatus | 40d5650 | convex/platformCredentials/queries.ts |
| 2 | Add collapsible sync log to IntegrationHealthCard | cf2b553 | src/components/salesAnalytics/IntegrationHealthCard.tsx |

## Decisions Made

- `syncHistory` initialized as `[]` before the `if/else` branch so `always_green` and `token_expiry` platforms get empty array automatically — no extra code per branch.
- Scoped `syncHistory` as `let` outside the branch so the single `results.push()` at the bottom includes it for all three platform types cleanly.
- `hasSyncHistory` guard hides the expand toggle for non-last_sync platforms — `Internal`, `Consignment`, `GrabFood`, and `BigSeller` cards remain flat rows.
- `SettingsTab.tsx` needed no changes — it already passes the full `health` object to `IntegrationHealthCard`, so `syncHistory` flows through transparently after backend change.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npm run type-check`: PASS
- `npm run build`: PASS (0 errors, 2 CSS warnings pre-existing)
- `PlatformHealthStatus` type has `syncHistory: SyncLogEntry[]`
- `IntegrationHealthCard` has ChevronDown/Up toggle + collapsible sync log section
- Expand toggle only visible when `health.syncHistory.length > 0`

## Self-Check: PASSED

- convex/platformCredentials/queries.ts: FOUND
- src/components/salesAnalytics/IntegrationHealthCard.tsx: FOUND
- .planning/phases/26-platform-auth-schema/26-05-SUMMARY.md: FOUND
- commit 40d5650: FOUND
- commit cf2b553: FOUND
