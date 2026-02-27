---
status: resolved
trigger: "Platform cards in the Settings tab (Sales Analytics) are not expandable/clickable. The user expects clicking a card to expand it and show the sync log history for that platform."
created: 2026-02-25T00:00:00Z
updated: 2026-02-27T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED and ALREADY FIXED — Phase 26-05 commits restored the expand/sync-history UI
test: Verified current code has syncHistory in type, query, and component; type-check passes
expecting: N/A — fix already in place
next_action: Archive session

## Symptoms

expected: Clicking a platform card expands it and shows sync log history (last 24h of sync runs)
actual: Cards are static rows — no onClick, no expand state, no sync history section
errors: None (no crash — feature was silently removed)
reproduction: Open Sales Analytics > Settings tab > click any platform card
started: After Phase 26-03 commit ee8eaec (Feb 25 2026)

## Eliminated

- hypothesis: The expand behavior never existed
  evidence: git show 026ed59:src/components/salesAnalytics/IntegrationHealthCard.tsx shows 456-line component with syncHistory rendering block (lines 354-413) and Accordion-based expand in SettingsTab (line 172)
  timestamp: 2026-02-25

- hypothesis: The syncHistory data no longer exists in the backend
  evidence: convex/externalData/queries.ts:getSyncHealthStatus (line 921) still exists and returns syncHistory[]
  timestamp: 2026-02-25

## Evidence

- timestamp: 2026-02-25
  checked: src/components/salesAnalytics/IntegrationHealthCard.tsx (at time of diagnosis, commit ee8eaec)
  found: Component was a flat row with no expand state or syncHistory rendering.
  implication: All expand/collapse behavior was removed in the Phase 26-03 refactor.

- timestamp: 2026-02-25
  checked: git show 026ed59 (original IntegrationHealthCard, 456 lines)
  found: Component used Card layout with expanded syncHistory section (lines 354-413) that rendered last 24h of sync runs from syncHealth.syncHistory[]. Also had useState for local expand toggle.
  implication: The old component had this feature fully built.

- timestamp: 2026-02-25
  checked: git commit ee8eaec message + diff stat
  found: "554 insertions(+), deletion(−)" in IntegrationHealthCard. The refactor reduced 554 lines (old) to 200 lines (new). The Phase 26 goal was to replace the dual-prop syncHealth+credentialStatus pattern with a single PlatformHealthStatus prop.
  implication: The refactor correctly simplified the data contract but accidentally dropped the sync history display entirely.

- timestamp: 2026-02-25
  checked: PlatformHealthStatus type in convex/platformCredentials/queries.ts (lines 161-172)
  found: The new PlatformHealthStatus type does NOT include a syncHistory field. It only has: platformId, platformName, authStrategy, category, status, label, lastActivity, daysRemaining, hasExpiry, reconnectSteps.
  implication: The data contract was changed — syncHistory array is not passed through getHealthStatusAll at all. Even if the component tried to render it, the data would not be available.

- timestamp: 2026-02-25
  checked: convex/externalData/queries.ts getSyncHealthStatus (lines 921-972)
  found: getSyncHealthStatus query still exists and returns syncHistory[] for k3mart, gobiz, internal. It is NOT called from the new SettingsTab.
  implication: The data query exists but is no longer wired into the UI.

- timestamp: 2026-02-25
  checked: src/components/salesAnalytics/SettingsTab.tsx (current)
  found: Only calls getHealthStatusAll. No call to getSyncHealthStatus. IntegrationHealthCard receives no syncHistory data.
  implication: Even if the card component was restored, it would need the syncHistory data re-wired.

- timestamp: 2026-02-27
  checked: Current codebase (IntegrationHealthCard.tsx, platformCredentials/queries.ts) + git log
  found: Fix was already applied in commits 40d5650 (type+query), cf2b553 (UI), 784a50d (guard), 945f776 (token refresh entries). Current IntegrationHealthCard has full expand/collapse with sync history. PlatformHealthStatus includes syncHistory field. getHealthStatusAll populates it for k3mart, gobiz, bigseller, grabfood. No uncommitted changes. tsc passes clean.
  implication: Bug was fixed between diagnosis (Feb 25) and this resume (Feb 27). No further action needed.

## Resolution

root_cause: |
  Phase 26-03 refactor (commit ee8eaec) replaced the old dual-prop IntegrationHealthCard (syncHealth + credentialStatus)
  with a new single-prop design (PlatformHealthStatus). In doing so, the refactor:
  (1) Removed the Accordion/expand wrapper from both SettingsTab and IntegrationHealthCard
  (2) Removed the syncHistory[] field from the new PlatformHealthStatus type
  (3) Stopped calling the existing getSyncHealthStatus query from SettingsTab
  The result: cards are now flat, non-interactive rows with no sync log history visible.

fix: |
  Already applied in Phase 26-05 (commits 40d5650 and cf2b553) and enhanced in Phase 29 (commit 945f776):
  1. 40d5650: Added SyncLogEntry type and syncHistory field to PlatformHealthStatus; populated in getHealthStatusAll query for last_sync and token_expiry platforms
  2. cf2b553: Added collapsible sync log UI to IntegrationHealthCard with useState isExpanded toggle, ChevronDown/Up icons, and sync history rendering
  3. 945f776: Extended sync history to show token refresh entries for all platform cards
  No additional code changes needed.

verification: |
  - PlatformHealthStatus type includes syncHistory: SyncLogEntry[] (line 200 of convex/platformCredentials/queries.ts)
  - getHealthStatusAll populates syncHistory for k3mart, gobiz, bigseller, grabfood platforms
  - IntegrationHealthCard has isExpanded state, expand toggle button, and collapsible sync history panel (lines 123, 208-263)
  - npx tsc --noEmit passes with zero errors
  - No uncommitted changes in relevant files

files_changed:
  - convex/platformCredentials/queries.ts (already committed in 40d5650)
  - src/components/salesAnalytics/IntegrationHealthCard.tsx (already committed in cf2b553)
