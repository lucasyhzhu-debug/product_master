---
status: diagnosed
phase: 26-platform-auth-schema
source: 26-04-SUMMARY.md, 26-05-SUMMARY.md, quick-29-SUMMARY.md
started: 2026-02-25T15:30:00Z
updated: 2026-02-25T15:55:00Z
---

## Current Test

[testing complete]

## Tests

### 1. All 6 Platforms Visible in Settings Tab
expected: Navigate to Sales Analytics > Settings tab. You should see 6 platform cards: K3Mart, GoBiz, Internal, GrabFood, BigSeller, Consignment. Each with a colored status indicator.
result: pass

### 2. K3Mart Card Expandable with Sync History
expected: K3Mart card shows a chevron toggle. Clicking it expands to show up to 5 recent sync log entries with status icons, relative timestamps, and record counts.
result: pass

### 3. GoBiz Card Expandable with Sync History
expected: GoBiz card shows a chevron toggle. Clicking expands sync history showing recent sync entries similar to K3Mart.
result: pass

### 4. GoBiz One-Click Token Refresh (Previously Failed)
expected: Click the action button on GoBiz card. Dialog opens with "Refresh Token (One-Click)" button. Clicking it should attempt to refresh the token. On success, status updates and you see a success message. On failure, you see GoBiz's actual error message (not a generic error). This was previously broken due to nested credential body — now fixed.
result: pass

### 5. GoBiz Token Refresh Creates Sync Log Entry
expected: After a GoBiz token refresh (success or failure), expand the GoBiz card's sync history. A new entry should appear with a blue "Token" badge (not gray "Sync"). The timestamp should match when you just refreshed.
result: issue
reported: "I don't see the blue token but the refresh worked - shows gray Sync badge instead"
severity: major

### 6. BigSeller Token Preview Shows UID (Previously Missing)
expected: Click action button on BigSeller card. Paste a muc_token (JWT format). The preview should show expiry date, days remaining countdown, AND the uid. UID was previously missing because only payload.uid was checked — now checks uid, user_id, sub, and id claims.
result: issue
reported: "user ID just says 'user' i'm not sure if that's correct but yeah it shows"
severity: minor

### 7. BigSeller Token Save Creates Sync Log Entry
expected: After saving a BigSeller token, the token is stored. If BigSeller card now has sync history entries, expand it to see a blue "Token" badge entry.
result: issue
reported: "I see no chevron - BigSeller card has no expand toggle after saving token"
severity: major

### 8. K3Mart Token Refresh Creates Sync Log Entry
expected: After a K3Mart token refresh, expand the K3Mart card. A new entry should appear with a blue "Token" badge alongside existing gray "Sync" entries for data syncs.
result: issue
reported: "k3mart entry shows the Sync not the Token - gray Sync badge instead of blue Token"
severity: major

### 9. Internal/Consignment Cards Flat (No Expand)
expected: Internal and Consignment cards should NOT show a chevron expand toggle. They appear as flat rows showing green "Connected" status. No sync history section.
result: pass

### 10. GrabFood/BigSeller Cards — Sync History Behavior
expected: GrabFood card should show sync history if credentials are configured (with expand toggle). BigSeller card should show sync history if a token is saved. If no credentials/token, no expand toggle.
result: issue
reported: "grabfood has no chevron, bigseller has no chevron"
severity: major

### 11. Sync History Badge Distinction (Token vs Sync)
expected: In any expanded sync history, token refresh entries show a BLUE "Token" badge and data sync entries show a GRAY "Sync" badge. Token refresh entries do NOT show a products/records count.
result: issue
reported: "all sync - no blue Token badges visible anywhere"
severity: major

## Summary

total: 11
passed: 5
issues: 6
pending: 0
skipped: 0

## Gaps

- truth: "GoBiz token refresh sync log entry shows blue Token badge"
  status: failed
  reason: "User reported: I don't see the blue token but the refresh worked - shows gray Sync badge instead"
  severity: major
  test: 5
  root_cause: "Likely deployment gap — Quick Task 29 commits (64fb6e9, 945f776) added syncType token_refresh to createSyncLog calls and badge logic, but npx convex dev may not have been running to deploy backend changes. The code is correct: loginWithCredentials passes syncType: token_refresh, and IntegrationHealthCard checks entry.syncType === token_refresh for blue badge. Need to confirm Convex dev was running during the refresh."
  artifacts:
    - path: "convex/integrations/gobiz/adapter.ts"
      issue: "loginWithCredentials correctly uses syncType: token_refresh — code is correct"
    - path: "src/components/salesAnalytics/IntegrationHealthCard.tsx"
      issue: "Badge logic at line 244 correctly checks token_refresh — code is correct"
  missing:
    - "Verify npx convex dev was running when user tested"
    - "Re-test after confirming Convex dev deployment"

- truth: "BigSeller JWT preview shows actual user ID number"
  status: failed
  reason: "User reported: user ID just says 'user' i'm not sure if that's correct"
  severity: minor
  test: 6
  root_cause: "BigSeller muc_token JWT likely stores the user type/role string 'user' in one of the checked claims (uid, user_id, sub, id) rather than a numeric user ID. The find() across 4 claims is working but the value it finds is a role string not an ID number. Need to inspect actual JWT payload to identify which claim holds the numeric ID."
  artifacts:
    - path: "convex/integrations/bigseller/adapter.ts"
      issue: "uid lookup uses find() across [uid, user_id, sub, id] — finds 'user' string from one of these claims"
  missing:
    - "Inspect actual BigSeller JWT payload to find the numeric user ID claim"
    - "Update claim key list to target the correct numeric ID field"

- truth: "BigSeller card shows expand toggle with sync history after token save"
  status: failed
  reason: "User reported: I see no chevron - BigSeller card has no expand toggle after saving token"
  severity: major
  test: 7
  root_cause: "Two possible causes: (1) Deployment gap — saveBigSellerToken's createSyncLog call was added in Quick Task 29 commit 64fb6e9 but may not have been deployed via npx convex dev. (2) Token was saved before the createSyncLog code existed, so zero rows in externalSyncLogs for source=bigseller. Re-pasting token after confirming deployment should create the first entry."
  artifacts:
    - path: "convex/integrations/bigseller/adapter.ts"
      issue: "createSyncLog call at line 128 is correct — code exists"
    - path: "convex/platformCredentials/queries.ts"
      issue: "token_expiry branch at line 352 correctly queries externalSyncLogs for bigseller"
  missing:
    - "Confirm npx convex dev deployed the changes"
    - "Re-paste BigSeller token to trigger first sync log entry"

- truth: "K3Mart token refresh sync log entry shows blue Token badge"
  status: failed
  reason: "User reported: k3mart entry shows the Sync not the Token"
  severity: major
  test: 8
  root_cause: "Same deployment gap as Test 5. performK3MartRefresh's createSyncLog call with syncType: token_refresh was added in Quick Task 29 commit 64fb6e9. If Convex dev wasn't running, the backend mutation still uses old code without the createSyncLog call."
  artifacts:
    - path: "convex/platformCredentials/actions.ts"
      issue: "createSyncLog calls at lines 139 and 162 are correct — code exists"
  missing:
    - "Confirm npx convex dev deployed the changes"
    - "Re-trigger K3Mart refresh after deployment"

- truth: "GrabFood and BigSeller cards have expand toggle when credentials/token configured"
  status: failed
  reason: "User reported: grabfood has no chevron, bigseller has no chevron"
  severity: major
  test: 10
  root_cause: "GrabFood: The grabfood adapter (convex/integrations/grabfood/adapter.ts) has ZERO calls to createSyncLog — it never writes to externalSyncLogs. Even though getHealthStatusAll queries for source=grabfood, there are zero rows to return. BigSeller: Same as Test 7 — deployment gap or no rows yet."
  artifacts:
    - path: "convex/integrations/grabfood/adapter.ts"
      issue: "Zero createSyncLog calls — GrabFood never writes sync log entries"
    - path: "convex/platformCredentials/queries.ts"
      issue: "always_green branch at line 231 queries correctly but gets zero results"
  missing:
    - "Add createSyncLog calls to GrabFood adapter (resolveToken success/error paths)"
    - "Re-paste BigSeller token after Convex dev deployment"

- truth: "Sync history entries distinguish token_refresh (blue Token) from manual/cron (gray Sync)"
  status: failed
  reason: "User reported: all sync - no blue Token badges visible anywhere"
  severity: major
  test: 11
  root_cause: "Same root cause as Tests 5 and 8 — deployment gap. The syncType: token_refresh entries were never created because the backend code wasn't deployed. All existing entries in externalSyncLogs have syncType: manual or cron from data syncs."
  artifacts:
    - path: "src/components/salesAnalytics/IntegrationHealthCard.tsx"
      issue: "Badge logic at line 244 is correct — just no token_refresh entries in DB"
  missing:
    - "Deploy backend via npx convex dev"
    - "Trigger token refreshes to create token_refresh entries"
    - "Verify badges render correctly"
