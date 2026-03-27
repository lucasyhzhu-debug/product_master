---
phase: 35-deprecate-feedback-overlay-remove-from-u
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/layout/Layout.tsx
  - src/components/feedback/index.ts
  - src/components/feedback/FeedbackPanelToggle.tsx
  - src/components/feedback/FeedbackPanel.tsx
  - src/components/feedback/FeedbackCard.tsx
  - src/components/feedback/FeedbackForm.tsx
  - src/components/feedback/FeedbackCaptureMode.tsx
  - src/components/feedback/CommentSection.tsx
  - src/components/feedback/ExportButton.tsx
  - src/hooks/convex/useFeedback.ts
  - src/hooks/convex/index.ts
  - src/lib/feedbackExport.ts
autonomous: true
requirements: [DEPRECATE-FEEDBACK-UI]

must_haves:
  truths:
    - "No floating feedback button appears on any page"
    - "No feedback sidebar panel can be opened"
    - "No feedback capture mode overlay exists in the app"
    - "Layout renders pages without any feedback-related state or components"
    - "Backend convex/feedback/ directory is untouched"
    - "Build passes with zero TypeScript errors"
  artifacts:
    - path: "src/components/layout/Layout.tsx"
      provides: "Clean layout without feedback imports, state, or JSX"
      contains: "Outlet"
    - path: "src/hooks/convex/index.ts"
      provides: "Barrel export without feedback re-exports"
  key_links:
    - from: "src/components/layout/Layout.tsx"
      to: "src/components/feedback/"
      via: "import removed"
      pattern: "MUST NOT match: from.*feedback"
    - from: "src/hooks/convex/index.ts"
      to: "src/hooks/convex/useFeedback.ts"
      via: "re-export removed"
      pattern: "MUST NOT match: useFeedback"
---

<objective>
Remove all frontend UI touchpoints for the visual feedback overlay feature. The feedback overlay (floating button, sidebar panel, screenshot capture mode, feedback form modal) is unused and adds unnecessary bundle weight and layout complexity. The backend (convex/feedback/) remains untouched in stasis for potential future use.

Purpose: Clean dead UI code, reduce bundle size, simplify Layout component
Output: Layout.tsx stripped of feedback state/JSX, feedback UI component directory deleted, hooks and lib helper deleted
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/layout/Layout.tsx
@src/hooks/convex/index.ts
@src/components/feedback/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Strip feedback overlay from Layout and delete UI files</name>
  <files>
    src/components/layout/Layout.tsx,
    src/components/feedback/index.ts,
    src/components/feedback/FeedbackPanelToggle.tsx,
    src/components/feedback/FeedbackPanel.tsx,
    src/components/feedback/FeedbackCard.tsx,
    src/components/feedback/FeedbackForm.tsx,
    src/components/feedback/FeedbackCaptureMode.tsx,
    src/components/feedback/CommentSection.tsx,
    src/components/feedback/ExportButton.tsx
  </files>
  <action>
1. **Edit `src/components/layout/Layout.tsx`:**
   - Remove the import block: `import { FeedbackPanelToggle, FeedbackPanel, FeedbackCaptureMode, FeedbackForm } from '@/components/feedback';`
   - Remove the `useState` for `isPanelOpen`, `isCaptureMode`, `capturedData` (all 3 state declarations, lines 21-26)
   - Remove the `useEffect` that resets feedback state on route change (lines 31-35)
   - Remove the 5 `useCallback` handlers: `handleStartCapture`, `handleCapture`, `handleCancelCapture`, `handleFormSuccess`, `handleFormCancel`, `handleTogglePanel` (lines 38-68)
   - Remove ALL JSX after `<MobileBottomNav />` -- the entire `{/* Feedback Overlay Components */}` section including `FeedbackPanelToggle`, `FeedbackPanel`, `FeedbackCaptureMode`, and the `capturedData &&` conditional block with `FeedbackForm` (lines 81-108)
   - Clean up unused imports from React: remove `useCallback` and `useEffect` from the React import if they are no longer used. Keep `useState` ONLY if still used elsewhere (it is NOT -- remove it). The `useLocation` import may still be needed by other code -- check. If `useLocation` was only used for the feedback reset effect, remove it too. The `location` const can be removed if unused.
   - **After edits, Layout.tsx should be a simple wrapper:** imports Header/Footer/MobileBottomNav/PageContainer/Outlet, accepts `fullWidth` prop, renders the shell with `<Outlet />` inside.

2. **Delete the entire `src/components/feedback/` directory** (all 8 files):
   - `index.ts`, `FeedbackPanelToggle.tsx`, `FeedbackPanel.tsx`, `FeedbackCard.tsx`, `FeedbackForm.tsx`, `FeedbackCaptureMode.tsx`, `CommentSection.tsx`, `ExportButton.tsx`
  </action>
  <verify>
    <automated>cd "D:\Claude\Product Manager\product_master\.worktrees\deprecate-feedback" && ! grep -r "feedback" src/components/layout/Layout.tsx && ! test -d src/components/feedback && echo "PASS: Layout clean, feedback dir deleted"</automated>
  </verify>
  <done>Layout.tsx has zero feedback references. The src/components/feedback/ directory no longer exists. No floating button, no sidebar panel, no capture mode, no form modal in the rendered app.</done>
</task>

<task type="auto">
  <name>Task 2: Remove feedback hooks, lib helper, and barrel re-exports</name>
  <files>
    src/hooks/convex/useFeedback.ts,
    src/hooks/convex/index.ts,
    src/lib/feedbackExport.ts
  </files>
  <action>
1. **Delete `src/hooks/convex/useFeedback.ts`** -- entire file (280 lines of query/mutation hooks for the feedback overlay).

2. **Delete `src/lib/feedbackExport.ts`** -- entire file (markdown report generator and clipboard helper for feedback items).

3. **Edit `src/hooks/convex/index.ts`:**
   - Remove the entire `// Visual Feedback Overlay` export block (lines 117-143), which re-exports all feedback hooks, helpers, and types from `./useFeedback`.
   - Do NOT touch any other export blocks in this file.

4. **Verify no dangling imports:** After deletion, grep `src/` for any remaining imports from `useFeedback` or `feedbackExport`. The only files that imported these were the deleted feedback components -- so there should be zero remaining references. If any are found, fix them.
  </action>
  <verify>
    <automated>cd "D:\Claude\Product Manager\product_master\.worktrees\deprecate-feedback" && ! test -f src/hooks/convex/useFeedback.ts && ! test -f src/lib/feedbackExport.ts && ! grep -r "useFeedback\|feedbackExport" src/hooks/convex/index.ts && echo "PASS: hooks and lib cleaned"</automated>
  </verify>
  <done>useFeedback.ts and feedbackExport.ts deleted. Barrel index no longer re-exports any feedback symbols. No dangling imports anywhere in src/.</done>
</task>

<task type="auto">
  <name>Task 3: Build verification and backend stasis confirmation</name>
  <files></files>
  <action>
1. Run `npm run type-check` to confirm zero TypeScript errors after removal.
2. Run `npm run build` to confirm production build succeeds.
3. Verify `convex/feedback/` directory still exists and is untouched (ls the directory, confirm queries.ts and mutations.ts are present and unmodified).
4. Run `npm run test` to confirm no test failures from the removal (there are no feedback-specific tests, but verify no collateral breakage).
  </action>
  <verify>
    <automated>cd "D:\Claude\Product Manager\product_master\.worktrees\deprecate-feedback" && npm run build && test -d convex/feedback && echo "PASS: build succeeds, backend untouched"</automated>
  </verify>
  <done>TypeScript type-check passes. Production build succeeds. convex/feedback/ backend directory exists with all files intact. No test regressions.</done>
</task>

</tasks>

<verification>
1. `npm run build` passes with zero errors
2. `grep -r "from.*feedback" src/components/layout/Layout.tsx` returns no matches
3. `ls src/components/feedback/` fails (directory deleted)
4. `ls convex/feedback/` succeeds (backend untouched)
5. `grep -r "useFeedback\|FeedbackPanel\|FeedbackForm\|FeedbackCaptureMode\|FeedbackPanelToggle\|feedbackExport" src/` returns no matches
</verification>

<success_criteria>
- `npm run build` succeeds
- Zero imports of feedback UI components remain in src/
- src/components/feedback/ directory does not exist
- src/hooks/convex/useFeedback.ts does not exist
- src/lib/feedbackExport.ts does not exist
- convex/feedback/ directory is untouched (backend in stasis)
- No floating button, sidebar panel, or capture overlay renders in the app
</success_criteria>

<output>
After completion, create `.planning/quick/35-deprecate-feedback-overlay-remove-from-u/35-SUMMARY.md`
</output>
