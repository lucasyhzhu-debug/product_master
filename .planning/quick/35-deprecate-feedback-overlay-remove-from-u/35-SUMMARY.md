---
phase: 35-deprecate-feedback-overlay-remove-from-u
plan: 01
subsystem: frontend-ui
tags: [cleanup, deprecation, bundle-size]
dependency-graph:
  requires: []
  provides: [clean-layout, reduced-bundle]
  affects: [src/components/layout/Layout.tsx, src/hooks/convex/index.ts]
tech-stack:
  added: []
  patterns: [dead-code-removal, barrel-export-cleanup]
key-files:
  created: []
  modified:
    - src/components/layout/Layout.tsx
    - src/hooks/convex/index.ts
  deleted:
    - src/components/feedback/index.ts
    - src/components/feedback/FeedbackPanelToggle.tsx
    - src/components/feedback/FeedbackPanel.tsx
    - src/components/feedback/FeedbackCard.tsx
    - src/components/feedback/FeedbackForm.tsx
    - src/components/feedback/FeedbackCaptureMode.tsx
    - src/components/feedback/CommentSection.tsx
    - src/components/feedback/ExportButton.tsx
    - src/hooks/convex/useFeedback.ts
    - src/lib/feedbackExport.ts
decisions:
  - Backend convex/feedback/ left in stasis for potential future use
key-decisions:
  - "Backend stasis: convex/feedback/ directory untouched (queries.ts + mutations.ts preserved)"
metrics:
  duration: 5min
  completed: 2026-03-27
---

# Quick Task 35: Deprecate Feedback Overlay - Remove from UI

Removed all frontend touchpoints for the unused visual feedback overlay (floating button, sidebar panel, screenshot capture mode, feedback form modal), deleting 1,718 lines across 10 files while preserving the backend in stasis.

## Tasks Completed

| # | Task | Commit | Files Changed | Lines Removed |
|---|------|--------|---------------|---------------|
| 1 | Strip feedback overlay from Layout and delete UI files | 8f93b36f | 9 | 1,137 |
| 2 | Remove feedback hooks, lib helper, and barrel re-exports | 471b70a3 | 3 | 581 |
| 3 | Build verification and backend stasis confirmation | (verification only) | 0 | 0 |

## Changes Made

### Layout.tsx (simplified)
- Removed imports: `FeedbackPanelToggle`, `FeedbackPanel`, `FeedbackCaptureMode`, `FeedbackForm`
- Removed React imports: `useState`, `useCallback`, `useEffect` (no longer needed)
- Removed `useLocation` import (only used for feedback route-change reset)
- Removed 3 state declarations, 1 useEffect, 6 useCallback handlers
- Removed all feedback JSX (toggle button, panel, capture mode overlay, form modal)
- Layout is now a clean shell: Header, Outlet (in PageContainer), Footer, MobileBottomNav

### Deleted Files (10 total)
- `src/components/feedback/` (8 files): Full UI component suite for visual feedback overlay
- `src/hooks/convex/useFeedback.ts`: 280 lines of Convex query/mutation hooks
- `src/lib/feedbackExport.ts`: Markdown report generator and clipboard helper

### Barrel Index Cleanup
- Removed 27-line `Visual Feedback Overlay` export block from `src/hooks/convex/index.ts`

## Backend Stasis

The `convex/feedback/` directory remains untouched with both files intact:
- `convex/feedback/queries.ts`
- `convex/feedback/mutations.ts`

These backend functions are preserved for potential future reactivation.

## Deviations from Plan

None - plan executed exactly as written.

## Deferred Issues

**Pre-existing build errors in Phase 60 (Asset Register) files:** The `tsc -b` build command fails due to missing `fixedAssets` in Convex generated types and implicit `any` types in `AssetDetailPanel.tsx`, `DepreciationPreviewDialog.tsx`, and `AssetRegister.tsx`. These are pre-existing on this worktree branch (the `_generated/api.d.ts` lacks `fixedAssets` because `npx convex dev` hasn't been run to regenerate types for Phase 60 schema changes). The `tsc --noEmit` type-check passes cleanly. These errors are NOT caused by feedback removal.

## Verification Results

| Check | Result |
|-------|--------|
| `npm run type-check` (tsc --noEmit) | PASS |
| No feedback imports in Layout.tsx | PASS |
| src/components/feedback/ deleted | PASS |
| convex/feedback/ untouched | PASS |
| No dangling feedback imports in src/ | PASS |
| useFeedback.ts deleted | PASS |
| feedbackExport.ts deleted | PASS |

## Self-Check: PASSED

All files verified present/deleted as claimed. Both commits exist in history.
