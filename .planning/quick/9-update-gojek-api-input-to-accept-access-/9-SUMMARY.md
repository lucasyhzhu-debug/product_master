---
phase: quick-9
plan: 9
subsystem: salesAnalytics
tags: [gobiz, auth, ux, token-dialog]
dependency_graph:
  requires: []
  provides: [GoBizTokenDialog JSON paste mode]
  affects: [src/components/salesAnalytics/GoBizTokenDialog.tsx]
tech_stack:
  added: []
  patterns: [JSON.parse with inline validation]
key_files:
  modified:
    - src/components/salesAnalytics/GoBizTokenDialog.tsx
decisions:
  - JSON.parse with inline error messages replaces separate textarea state for access_token and refresh_token
  - refreshToken is optional — only included in saveDirectToken call when present in JSON
metrics:
  duration: "47s"
  completed: "2026-02-20T06:15:47Z"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 9: Update GoBiz API Input to Accept Auth JSON Blob

**One-liner:** Replaced two separate GoBiz token textareas with a single JSON paste field that parses access_token and refresh_token from the pasted blob.

## What Was Built

Rewrote `GoBizTokenDialog.tsx` to accept a single JSON paste textarea instead of two separate Access Token / Refresh Token fields.

The workflow now matches how GoBiz DevTools returns auth data — as a JSON object with `access_token`, `refresh_token`, and `dbl_enabled` fields — rather than requiring the user to locate and copy each cookie value separately.

## Changes

### src/components/salesAnalytics/GoBizTokenDialog.tsx

- Removed `bearerToken` (string) and `refreshToken` (string) state
- Added `jsonInput` (string) state initialized to `""`
- Updated `handleSaveAndSync` to:
  - Check for empty input ("Paste the GoBiz auth JSON to continue")
  - Parse JSON with try/catch (inline error: "Invalid JSON — paste the full JSON object from GoBiz")
  - Extract `access_token` (required) and `refresh_token` (optional)
  - Show "JSON does not contain access_token" if missing
  - Pass `bearerToken: accessToken` and optionally `refreshToken` to `saveDirectToken` (unchanged mutation signature)
  - Reset `setJsonInput("")` on success
- Replaced two textarea blocks with a single `<Textarea id="gobiz-json">` with 6-row height, monospace font, and JSON placeholder
- Updated `DialogDescription` to describe the JSON workflow
- Changed button `disabled` condition to `saving || !jsonInput.trim()`
- Added `setError(null)` on each keystroke in the JSON field (clears stale errors)

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npm run type-check` passes clean (0 errors)
- Single JSON textarea replaces two separate token fields
- JSON parsing extracts access_token (required) and refresh_token (optional)
- Inline validation errors for bad JSON and missing access_token
- Backend call signature to `saveDirectToken` is unchanged

## Self-Check: PASSED

- File exists: `src/components/salesAnalytics/GoBizTokenDialog.tsx` — FOUND
- Commit e820383 — FOUND
