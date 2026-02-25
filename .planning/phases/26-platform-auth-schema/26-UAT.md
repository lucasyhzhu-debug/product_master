---
status: complete
phase: 26-platform-auth-schema
source: 26-01-SUMMARY.md, 26-02-SUMMARY.md, 26-03-SUMMARY.md
started: 2026-02-25T00:00:00Z
updated: 2026-02-25T00:01:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Settings Tab - All 6 Platforms Visible
expected: Navigate to Sales Analytics → Settings tab (requires Manager or Admin role). You should see a list of 6 platform integration cards: K3Mart, GoBiz, GrabFood, BigSeller, Consignment, and Internal. Each card shows the platform name and a colored status badge.
result: pass

### 2. Internal & Consignment Always Connected
expected: The "Internal" and "Consignment" platform cards always show a green "Connected" status badge regardless of any credentials — they are always-green platforms with no token required.
result: pass

### 3. K3Mart / GoBiz Sync-Based Status
expected: K3Mart and GoBiz cards show status based on last sync age: green if synced within 2 days, yellow if 2–7 days ago, red if over 7 days. If never synced, they show disconnected/red.
result: issue
reported: "we need to be able to click each cell and it should expand to show the log of that sync (like we had previously)"
severity: major

### 4. GoBiz Dialog - One-Click Refresh as Primary Action
expected: Click the action button on the GoBiz card. A dialog opens with "Refresh Token (One-Click)" as the primary/prominent button. Clicking it attempts to call the GoBiz API using server-stored credentials (no password entry needed).
result: issue
reported: "receiving a 400 GoBiz login failed (400) - check logs as well for issues from using my login details - do we need a 2-step thing where we input our email first then we input our password?"
severity: major

### 5. GoBiz Dialog - Collapsible Manual Fallback
expected: In the GoBiz dialog, there is a collapsible section (e.g., "Manual JSON paste" or similar) that can be expanded to paste a token manually as a fallback option. It is collapsed by default.
result: pass

### 6. BigSeller Dialog - Auto-Preview on JWT Paste
expected: Click the action button on the BigSeller card. A dialog opens with a textarea. When you paste a BigSeller muc_token (which is a JWT — three dot-separated parts), the dialog automatically shows a preview: expiry date, days remaining countdown, and a UID. The "Save Token" button only enables after a successful preview.
result: pass

### 7. BigSeller Expiry Countdown Color
expected: The BigSeller token preview (and/or the card badge) shows a countdown with color: green if >7 days remaining, yellow if 3–7 days, red if <3 days. The countdown text format is something like "12d left" or "expires in 3 days".
result: issue
reported: "pass but I can't see the UID when i paste the token in"
severity: minor

## Summary

total: 7
passed: 4
issues: 3
pending: 0
skipped: 0

## Gaps

- truth: "Platform cards are clickable and expand to show sync log history for that platform"
  status: failed
  reason: "User reported: we need to be able to click each cell and it should expand to show the log of that sync (like we had previously)"
  severity: major
  test: 3
  artifacts: []
  missing: []

- truth: "GoBiz one-click token refresh succeeds using server-stored credentials (GOBIZ_EMAIL + GOBIZ_PASSWORD env vars)"
  status: failed
  reason: "User reported: receiving a 400 GoBiz login failed (400) - check logs as well for issues from using my login details - do we need a 2-step thing where we input our email first then we input our password?"
  severity: major
  test: 4
  artifacts: []
  missing: []

- truth: "BigSeller JWT preview shows expiry date, days remaining countdown, AND uid decoded from the token"
  status: failed
  reason: "User reported: pass but I can't see the UID when i paste the token in"
  severity: minor
  test: 7
  artifacts: []
  missing: []
