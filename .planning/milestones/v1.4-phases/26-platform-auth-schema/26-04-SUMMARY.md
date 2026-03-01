---
phase: 26-platform-auth-schema
plan: "04"
subsystem: api
tags: [gobiz, bigseller, jwt, adapter, integration]

# Dependency graph
requires:
  - phase: 26-platform-auth-schema
    provides: GoBiz loginWithCredentials and BigSeller previewBigSellerToken actions (Plans 02-03)
provides:
  - GoBiz password grant sends flat credential body (email/password at top-level, no nested data key)
  - GoBiz non-200 responses surface error_description from GoBiz API in returned error string
  - BigSeller uid lookup checks uid, user_id, sub, and id JWT claims via find()
affects: [phase-27-grabfood-pos-integration, phase-28-bigseller-sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Flatten credential body for OAuth password grant — email/password at top-level, not nested"
    - "Read and surface API error body from non-200 responses for admin-visible error messages"
    - "JWT claim fallback via Array.find() across multiple candidate keys"

key-files:
  created: []
  modified:
    - convex/integrations/gobiz/adapter.ts
    - convex/integrations/bigseller/adapter.ts

key-decisions:
  - "GoBiz loginWithCredentials body is flat: { client_id, grant_type, email, password } — no data wrapper"
  - "GoBiz error handler reads response body and prefers error_description claim for human-readable message"
  - "BigSeller uid resolved via find() across [uid, user_id, sub, id] — consistent with JWT standard claim names"

patterns-established:
  - "OAuth password grant body: always flat top-level fields, never nested under data/credentials key"
  - "API error surface: read response body on non-200, prefer error_description, fallback to full JSON"

requirements-completed: [AUTH-01, AUTH-02]

# Metrics
duration: 5min
completed: 2026-02-25
---

# Phase 26 Plan 04: Platform Auth Adapter Bug Fixes Summary

**GoBiz credential body flattened (unblocking one-click token refresh) and BigSeller uid claim lookup broadened to 4 JWT keys**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-25T10:01:46Z
- **Completed:** 2026-02-25T10:06:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Fixed GoBiz `loginWithCredentials` — credentials now sent as flat `{ client_id, grant_type, email, password }` body, eliminating the 400 error caused by the nested `data` key
- Improved GoBiz error handling — non-200 responses now read the response body and surface `error_description` (or full JSON) so admins see GoBiz's actual error message
- Fixed BigSeller `previewBigSellerToken` — uid resolution now uses `find()` across `payload.uid`, `payload.user_id`, `payload.sub`, and `payload.id` so any JWT claim convention shows the uid in the preview UI

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix GoBiz loginWithCredentials — flatten credential body + surface error message** - `de4f8ca` (fix)
2. **Task 2: Fix BigSeller previewBigSellerToken — multi-key uid lookup** - `df8090b` (fix)

## Files Created/Modified

- `convex/integrations/gobiz/adapter.ts` - Flattened credential body; improved error handler reads response body
- `convex/integrations/bigseller/adapter.ts` - uid lookup uses find() across 4 claim keys

## Decisions Made

None - followed plan as specified. Both fixes were exactly as described in the plan's action blocks.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Both changes were minimal and type-check + build passed immediately.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- GoBiz one-click token refresh is now unblocked — the credential body was the only blocker (UAT major issue resolved)
- BigSeller uid preview will now show uid for tokens using any standard JWT claim name (UAT minor issue resolved)
- Phase 26 is fully complete (Plans 01-04 done). Ready to merge `gsd/phase-26-platform-auth-schema` to main and start Phase 27.

---
*Phase: 26-platform-auth-schema*
*Completed: 2026-02-25*
