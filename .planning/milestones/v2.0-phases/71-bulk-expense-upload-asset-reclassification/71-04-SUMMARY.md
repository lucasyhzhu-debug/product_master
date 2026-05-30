---
phase: 71-bulk-expense-upload-asset-reclassification
plan: 04
subsystem: assets
tags: [frontend, disposal, reclassification, expense]
dependency_graph:
  requires: [71-01]
  provides: [reclassify-to-expense-ui]
  affects: [AssetDetailPanel, DisposeAssetDialog, useFixedAssets]
tech_stack:
  added: []
  patterns: [SearchableSelect-for-account-selection, auto-mapped-defaults-from-category]
key_files:
  created: []
  modified:
    - src/components/assets/DisposeAssetDialog.tsx
    - src/components/assets/AssetDetailPanel.tsx
    - src/hooks/convex/useFixedAssets.ts
decisions:
  - Frontend category-to-expense mapping mirrored from backend with keep-in-sync comment
  - Dialog handles all success toasts contextually instead of hook-level generic toast
metrics:
  duration: 6min
  completed: 2026-04-11
---

# Phase 71 Plan 04: Asset Reclassification Dialog Summary

Extended DisposeAssetDialog with "Reclassify to Expense" as fourth disposal type, auto-mapped expense account from category, and SearchableSelect-based owner selection.

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Extend DisposeAssetDialog with reclassify option | c239ea2e | Added reclassify_to_expense type, SearchableSelect dropdowns, auto-mapped account, contextual toasts |

## Task 2: Awaiting Human Verification

Task 2 is a checkpoint:human-verify gate requiring manual testing of the full reclassification flow.

## Changes Made

### src/components/assets/DisposeAssetDialog.tsx
- Added `reclassify_to_expense` to DisposalType union
- Added `SearchableSelect` for expense account (filtered to opex/cogs/other) and owner selection
- Auto-maps default expense account (6200) from asset category via `CATEGORY_DEFAULT_EXPENSE_CODE`
- Shows NBV breakdown preview (Cost / Accum Depr / NBV) instead of gain/loss for reclassify
- Warning text shows exact NBV amount
- Contextual success toasts: shows expense number for reclassify, generic for others
- Confirm button disabled until date + account + owner selected for reclassify
- `category: string` added to props interface

### src/components/assets/AssetDetailPanel.tsx
- Passes `category: asset.category` to DisposeAssetDialog (I-03 fix)

### src/hooks/convex/useFixedAssets.ts
- useDisposeAsset `successMessage` changed to `""` (I-05 fix) -- dialog handles all success toasts

## Staff Review Fixes Applied

- **C-02**: Uses `api.accounts.queries.list` with `{ activeOnly: true }`, not `listActive`
- **I-03**: AssetDetailPanel passes `category: asset.category` to DisposeAssetDialog
- **I-04**: `CATEGORY_DEFAULT_EXPENSE_CODE` has mirror/keep-in-sync comment
- **I-05**: useDisposeAsset uses `successMessage: ""`, dialog handles all toasts contextually

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused label state variables**
- **Found during:** Task 1 build verification
- **Issue:** `targetAccountLabel` and `submitterLabel` were declared and set but never read (TS6133)
- **Fix:** Removed label state variables; SearchableSelect handles display internally via items lookup
- **Files modified:** src/components/assets/DisposeAssetDialog.tsx
- **Commit:** c239ea2e

## Verification

- `npx tsc --noEmit` passes (exit 0)
- `npm run build` succeeds

## Self-Check: PASSED
