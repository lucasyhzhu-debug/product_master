---
status: testing
phase: 26-platform-auth-schema
source: 26-04-SUMMARY.md, 26-05-SUMMARY.md
started: 2026-02-25T11:00:00Z
updated: 2026-02-25T11:45:00Z
---

## Current Test

number: 3
name: GoBiz one-click — actionable error + yellow badge
expected: |
  Click "Refresh Token (One-Click)". You should see: "GoBiz requires browser login.
  Open portal.gofoodmerchant.co.id..." (not a cryptic 400/401 code). After clicking,
  the GoBiz badge should update to yellow "Token refresh failed" (not green "Connected").
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

### 3. GoBiz one-click token refresh — actionable error shown
expected: Click "Refresh Token (One-Click)". Since GoBiz requires browser-based login (OTP/session cookies), one-click can't succeed headlessly. The error message should now read: "GoBiz requires browser login. Open portal.gofoodmerchant.co.id, log in, then use DevTools → Application → Cookies to copy access_token and refresh_token, and paste them using the manual method below." The badge should also update to "Token refresh failed" (yellow) after clicking.
result: [pending]
diagnosis: "GoBiz /goid/token requires application/x-www-form-urlencoded (form-encoded). Sandbox confirmed: JSON body → 400 missing_field; form-encoded → 401 auth (correct format). But 401 persists even with real GOBIZ_EMAIL/PASSWORD env vars — GoBiz requires browser auth (OTP/session) not replicable via API. Fixes: form-urlencoded format + actionable error message + lastRefreshStatus=error written to DB + health badge shows yellow on failure."

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
