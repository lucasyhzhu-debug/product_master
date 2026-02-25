---
status: testing
phase: 26-platform-auth-schema
source: 26-04-SUMMARY.md, 26-05-SUMMARY.md
started: 2026-02-25T11:00:00Z
updated: 2026-02-25T11:45:00Z
---

## Current Test

number: 3
name: GoBiz one-click token refresh succeeds
expected: |
  Click the action button on the GoBiz card. The dialog opens. Click
  "Refresh Token (One-Click)". It should succeed (no 400 error). If env
  vars are configured, the token refreshes. If env vars are missing, a
  clear error message explains "GoBiz credentials not configured".
awaiting: user response

## Context for Resume

**FIX DEPLOYED — awaiting verification of Test 3.**

Two fixes were applied to convex/integrations/gobiz/adapter.ts during this session:

- commit 87931ca: Restored nested `data: { email, password }` format (Plan 04 had
  incorrectly flattened this)
- commit 9715e51: Added Step 1 call to /goid/login/request before /goid/token.
  GoBiz uses a two-step challenge-response flow discovered via DevTools capture:
    Step 1: POST /goid/login/request { email, login_type: "password", client_id }
    Step 2: POST /goid/token { client_id, grant_type: "password", data: { email, password } }
  Also added origin/referer headers matching the GoBiz portal.

Convex should have hot-reloaded. Resume by retrying Test 3 (click Refresh Token in GoBiz dialog).

## Tests

### 1. K3Mart & GoBiz cards expand to show sync log
expected: In Sales Analytics → Settings tab, the K3Mart and GoBiz platform cards now have a chevron (▼) icon on the right. Clicking the card/chevron expands a sync history section showing the last sync entries (timestamp, status icon, record count). Clicking again collapses it.
result: pass
notes: "User confirmed pass — noted others will expand once they have real sync data"

### 2. Other platforms have no expand toggle
expected: Internal, Consignment, GrabFood, and BigSeller cards do NOT show any chevron or expand toggle — they remain flat rows.
result: pass

### 3. GoBiz one-click token refresh succeeds
expected: Click the action button on the GoBiz card. The dialog opens. Click "Refresh Token (One-Click)". It should succeed (no 400 error). If env vars are configured, the token refreshes and the card status updates. If env vars are missing, a clear error message explains "GoBiz credentials not configured".
result: [pending]
fix_deployed: "commit 9715e51 — two-step login flow + origin/referer headers"

### 4. BigSeller paste shows UID in preview
expected: Open the BigSeller paste dialog and paste a muc_token JWT. The preview section now shows the UID extracted from the token (even if the JWT uses user_id, sub, or id claim instead of uid). All three fields — expiry date, days remaining, and uid — are visible in the preview.
result: [pending]

## Summary

total: 4
passed: 2
issues: 0
pending: 2
skipped: 0

## Gaps

[none yet — previous issues addressed by fixes in this session, pending verification]
