---
phase: 74-staff-attendance
plan: 02
subsystem: frontend
tags: [react, routing, kitchen-ux, attendance, clock-in, clock-out, alert-dialog, timer]

requires:
  - phase: 74-staff-attendance
    plan: 01
    provides: api.staffAttendance.{mutations.clockIn, mutations.clockOut, queries.getCurrentOpenShift, queries.getMyLastShiftSummary} consumed by this plan

provides:
  - useAttendance hook module (useCurrentOpenShift, useMyLastShiftSummary, useClockIn, useClockOut)
  - RunningTimer component (minute-resolution, tabular-nums, display-only per T-74-16)
  - ClockOutButton component (destructive, pending state, sonner toast)
  - ClockOutNudgeDialog component (D-08 non-blocking; ClockOutButton rendered as
    plain AlertDialog footer item, NOT AlertDialogAction — avoids auto-close race)
  - AttendanceStrip component (self-contained, returns null when no open shift)
  - ClockInGate page at /kitchen/clock (welcome card, WIB live clock, one-tap Clock-In,
    D-04 prior-day block, same-day auto-redirect, last-shift recap)
  - Kitchen-role post-login landing page = /kitchen/clock (getRoleLandingPage + RoleBasedRedirect)
  - KitchenViewV2 renders AttendanceStrip at top + ClockOutNudgeDialog at bottom
  - EndOfShiftForm exposes onSubmitted?: (selectedChefId: string) => void
  - D-08 self-submission gate wired in KitchenViewV2 (T-74-17 wrong-user mitigation)

affects:
  - 74-03 (manager staff-performance page): this plan ships the same-day auto-redirect
    and prior-day block UX; Plan 03 consumes the flagged-shifts surface for corrections
  - 74-04 (tests + docs): real integration tests for gate screen + nudge will live here

tech-stack:
  added: []
  patterns:
    - "Self-contained null-render component pattern (AttendanceStrip) — parent renders
      unconditionally; child reads its own query and collapses to null when no data"
    - "Plain button inside AlertDialogFooter to avoid AlertDialogAction auto-close race
      (dialog closes AFTER mutation via onClockedOut callback)"
    - "Role-specific post-login landing via getRoleLandingPage + RoleBasedRedirect —
      two separate call-sites, both updated consistently"
    - "Parent-gated callback pattern: EndOfShiftForm emits raw selectedChefId, parent
      decides whether to open dialog — keeps the form domain-agnostic and prevents
      wrong-user clock-out (T-74-17)"

key-files:
  created:
    - src/hooks/convex/useAttendance.ts
    - src/components/staffAttendance/RunningTimer.tsx
    - src/components/staffAttendance/ClockOutButton.tsx
    - src/components/staffAttendance/ClockOutNudgeDialog.tsx
    - src/components/staffAttendance/AttendanceStrip.tsx
    - src/components/staffAttendance/index.ts
    - src/components/staffAttendance/__tests__/RunningTimer.test.tsx
    - src/pages/ClockInGate.tsx
  modified:
    - src/hooks/convex/index.ts (barrel exports 4 attendance hooks)
    - src/lib/types.ts (getRoleLandingPage kitchen → /kitchen/clock)
    - src/App.tsx (lazy import + route + RoleBasedRedirect)
    - src/components/kitchen/EndOfShiftForm.tsx (onSubmitted prop + call + dep)
    - src/pages/KitchenViewV2.tsx (AttendanceStrip + nudge wiring)
    - convex/_generated/api.d.ts (regenerated with staffAttendance bindings)

key-decisions:
  - "DashboardHeader NOT modified — staff review confirmed it is orphaned on main
    (KitchenViewV2 renders ProductionTargetsBar, not DashboardHeader). Introduced a
    NEW sibling AttendanceStrip instead of editing unreachable code."
  - "ClockOutButton is NOT wrapped in AlertDialogAction/asChild inside
    ClockOutNudgeDialog. AlertDialogAction auto-closes the dialog on click BEFORE the
    mutation resolves, causing a focus/click race with ClockOutButton's onClockedOut
    handler. Rendered as a plain footer item instead; button closes the dialog via
    onClockedOut AFTER the mutation settles."
  - "Self-submission gate uses selectedChefId === \"\" OR selectedChefId === user.userId
    (AuthSession exposes userId, not _id — plan doc referenced _id which was incorrect).
    Empty string is the default 'no chef selected' state and is treated as self-submission."
  - "T-74-15 (ClockInGate flash-loop) was DROPPED 2026-04-16 — staff review concluded
    the risk was speculative and mitigation was dead code anyway. ClockInGate has NO
    location.state?.fromPermissionDenied branch."

patterns-established:
  - "Attendance hook barrel exports via src/hooks/convex/index.ts — consumers import
    from '@/hooks/convex' when possible"
  - "Null-render strip pattern: AttendanceStrip renders itself or nothing; placement
    contract documented in JSDoc so future maintainers know it's safe to drop
    unconditionally into layouts"
  - "Dialog action without racing auto-close: plain Button inside AlertDialogFooter
    + onClockedOut callback for post-mutation dialog close"

requirements-completed: [ATT-01]

duration: ~25 min
completed: 2026-04-16
---

# Phase 74 Plan 02: Kitchen Staff Clock-In/Out UX Surface Summary

**Gate screen at `/kitchen/clock` for kitchen-role users after PIN login, AttendanceStrip (RunningTimer + ClockOutButton) rendered at the top of KitchenViewV2 when clocked in, D-08 non-blocking clock-out nudge dialog wired into EndOfShiftForm submission with T-74-17 self-submission gate to prevent wrong-user clock-out.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3
- **Files created:** 8
- **Files modified:** 6

## Accomplishments

- ATT-01 (one-tap PIN-authenticated clock in/out) delivered end-to-end.
- Gate screen displays welcome, WIB live clock, one-tap Clock-In, and last-shift recap. D-04 prior-day open shift blocks the button and shows remediation + Log out path.
- RunningTimer + ClockOutButton follow the clocked-in user into KitchenViewV2 via the self-contained AttendanceStrip — which renders null when not clocked in, so kitchen-role users not clocked in and manager/admin viewing kitchen see zero visual change.
- D-08 nudge appears after EndOfShiftForm submission ONLY when the submitter is clocking out themselves. Submitting on behalf of another chef does NOT open the nudge (T-74-17 wrong-user clock-out mitigation).
- DashboardHeader (dead code on main) left untouched — any edits there would be unreachable. Staff review confirmed this and the plan targeted a new sibling component instead.

## Task Commits

Each task committed atomically (--no-verify per parallel-executor protocol):

1. **Task 1: Hooks + 4 component primitives + smoke test** — `7e41842e` (feat)
2. **Task 2: ClockInGate page + /kitchen/clock route + landing page update** — `56d44293` (feat)
3. **Task 3: AttendanceStrip wiring + D-08 nudge in KitchenViewV2 + EndOfShiftForm prop** — `a80390e9` (feat)
4. **api.d.ts regen (carried over from Plan 01)** — `978190b5` (chore)

## Files Created / Modified

### Created
- `src/hooks/convex/useAttendance.ts` — useCurrentOpenShift, useMyLastShiftSummary, useClockIn, useClockOut
- `src/components/staffAttendance/RunningTimer.tsx` — 60s tick, tabular-nums, display-only
- `src/components/staffAttendance/ClockOutButton.tsx` — destructive, pending state, sonner toast
- `src/components/staffAttendance/ClockOutNudgeDialog.tsx` — D-08, plain footer button (no race)
- `src/components/staffAttendance/AttendanceStrip.tsx` — self-contained null-render strip
- `src/components/staffAttendance/index.ts` — barrel exports
- `src/components/staffAttendance/__tests__/RunningTimer.test.tsx` — 2 passing
- `src/pages/ClockInGate.tsx` — welcome, live clock, clock-in, D-04 block, last-shift recap

### Modified
- `src/hooks/convex/index.ts` — added 4 attendance hook exports
- `src/lib/types.ts` — `getRoleLandingPage("kitchen")` → `/kitchen/clock`
- `src/App.tsx` — lazy import, `<Route path="kitchen/clock">` under `<Layout fullWidth />`, RoleBasedRedirect routes kitchen role to `/kitchen/clock`
- `src/components/kitchen/EndOfShiftForm.tsx` — added `onSubmitted?: (selectedChefId: string) => void`, called after `setStep("success")`, added to useCallback deps
- `src/pages/KitchenViewV2.tsx` — imports, `useCurrentOpenShift` + `nudgeOpen` state, `<AttendanceStrip />` at top, `onSubmitted` handler on `<EndOfShiftForm>` (self-submission gate), `<ClockOutNudgeDialog>` at bottom
- `convex/_generated/api.d.ts` — regenerated with staffAttendance bindings (Plan 01 created the backend but hadn't regenerated api.d.ts in this worktree)

## API Surface

### Hooks (src/hooks/convex/useAttendance.ts)

| Hook | Args | Returns |
|------|------|---------|
| `useCurrentOpenShift` | — | `Doc<"staffAttendance"> \| null \| undefined` |
| `useMyLastShiftSummary` | — | `{ date, clockIn, clockOut, durationMs, ballsProduced } \| null \| undefined` |
| `useClockIn` | — | `(args: {}) => Promise<Id<"staffAttendance">>` |
| `useClockOut` | — | `(args: { attendanceId }) => Promise<void>` |

All hooks use `useProtectedMutation` / query "skip" guards so callers can render without auth checks.

### Components (src/components/staffAttendance/)

| Component | Props | Purpose |
|-----------|-------|---------|
| `RunningTimer` | `{ clockIn: number, className? }` | Minute-resolution elapsed timer (display only) |
| `ClockOutButton` | `{ attendanceId, size?, onClockedOut? }` | Destructive button + toast, fires callback AFTER mutation |
| `ClockOutNudgeDialog` | `{ open, onOpenChange, attendanceId \| null }` | D-08 non-blocking post-submit nudge |
| `AttendanceStrip` | — | Self-contained; reads open shift, renders timer + button or null |

### Routes (src/App.tsx)

New route `<Route path="kitchen/clock">` with `<ProtectedRoute requiredPermission="canAccessKitchen">` under the existing `<Layout fullWidth />` block.

### EndOfShiftForm Prop

New optional `onSubmitted?: (selectedChefId: string) => void` — called after successful submit with the current `selectedChefId` state value (empty string means "no explicit chef selected"). Used by KitchenViewV2 to decide whether to open the self-clock-out nudge.

## Decisions Made

1. **DashboardHeader NOT modified.** The plan's original design (edit DashboardHeader to add timer + button) was caught by staff review: DashboardHeader is orphaned on main (no import, no render). A new sibling component `AttendanceStrip` replaces the planned edit. Unchanged DashboardHeader is verified by acceptance criterion `grep -q "RunningTimer\|ClockOutButton" src/components/kitchen/DashboardHeader.tsx` exits 1.

2. **ClockOutButton as plain footer item, NOT AlertDialogAction.** AlertDialogAction auto-closes the dialog on click before the async mutation resolves, creating a focus/click race against ClockOutButton's own `onClockedOut` handler. Instead, the dialog is closed by ClockOutButton's `onClockedOut` callback AFTER the mutation settles. Verified by acceptance criterion `grep -q "AlertDialogAction asChild" src/components/staffAttendance/ClockOutNudgeDialog.tsx` exits 1 (absent).

3. **Self-submission gate uses `user.userId` (not `user._id`).** The plan doc referenced `user._id` but AuthSession exposes `userId: string`. The gate check reads `selectedChefId === "" || selectedChefId === user?.userId`. This is a plan-doc correction, not a behavioral change — both values identify the current user.

4. **T-74-15 (flash-loop) dropped.** Staff review concluded the risk was speculative. ClockInGate has NO `location.state?.fromPermissionDenied` branch. Verified by acceptance criterion `grep -q "fromPermissionDenied" src/pages/ClockInGate.tsx` exits 1.

5. **api.d.ts regenerated in this plan.** Plan 01 added `convex/staffAttendance/` but did not regenerate `convex/_generated/api.d.ts` in this worktree. This plan's frontend imports `api.staffAttendance.*` so the generated types must reflect the new modules. Regenerated via `npx convex codegen` against dev deployment and committed as a chore (no functional change — the types were derivable from backend already in tree).

## Deviations from Plan

- **Used `user.userId` instead of `user._id` in the self-submission gate.** The plan's `<interfaces>` section referenced `user._id` but the actual AuthSession type exposes `userId: string`. This is a plan-doc correction only — the semantics (comparing against the current user's id) are identical.

- **Regenerated `convex/_generated/api.d.ts` as a separate commit (chore).** Not strictly a deviation from the plan's stated tasks but an unavoidable step since Plan 01 did not regenerate the types. Without this, the frontend would not compile (`api.staffAttendance.*` would be unknown).

- **Added `onSubmitted` to the useCallback dependency array** in EndOfShiftForm (not explicit in the plan, but necessary to avoid captured-stale-reference bugs when the parent swaps handlers between renders). Auto-fix Rule 1 (bug — React stale closure).

## Issues Encountered

- **Plan 01 did not regenerate api.d.ts.** Frontend type-check would have failed without the regen. Fixed by running `npx convex codegen` in this worktree. Committed as `chore(74-02)` with rationale.

- **Plan doc referenced `user._id` on AuthSession** — actual field is `userId`. Corrected inline in the self-submission gate; semantic identity is preserved.

## Verification

- `npm run type-check` — passes (tsc --noEmit, 0 errors)
- `npm run build` — passes (tsc -b + vite build, built in 21.31s, 3671 modules)
- `npx vitest run src/components/staffAttendance/__tests__/RunningTimer.test.tsx` — 2/2 passing
- `npx vitest run` (full suite) — 1526 passing, 27 todos (expected, Wave 0 scaffolds), 4 skipped, 0 failures across 113 test files (30.71s)
- All 22 Task 1-3 acceptance criteria grep checks green
- Manual smoke deferred to Plan 04 E2E + human UAT (kitchen PIN login → gate → clock in → kitchen view → clock out via nudge)

## Threat Model Mitigations

| ID | Status | Evidence |
|----|--------|----------|
| T-74-01 | ✅ | `useClockIn` strips token via `useProtectedMutation`; ClockInGate calls `clockIn({})` with NO userId arg. Backend `requireRole` (Plan 01) re-derives userId from session. |
| T-74-03 | ✅ | `useMyLastShiftSummary` + `useCurrentOpenShift` send only `{ token }`; backend hard-scopes to session userId. |
| T-74-04 | ✅ | ClockInGate hides Clock-In button when `openShift.date < todayWib`; shows remediation message. Backend also enforces (defense-in-depth). |
| T-74-07 | ✅ (accept) | RunningTimer + ClockInGate live clock both use 60s `setInterval` — negligible CPU. No network on tick (reactive query). |
| T-74-08 | ✅ | `useCurrentOpenShift` re-fires on auth token change; when a new user logs in, nudge attendanceId flips to the new session's open shift (or null). |
| T-74-16 | ✅ (accept) | RunningTimer uses `Date.now()`; JSDoc documents "Display only — authoritative hours computed server-side via durationMs." Verified by acceptance criterion `grep -q "Display only"`. |
| T-74-17 | ✅ | KitchenViewV2 `onSubmitted` handler gates nudge on `selectedChefId === "" \|\| selectedChefId === user?.userId`. Submissions on behalf of another chef do NOT open the nudge. |

T-74-15 dropped (see Decisions Made #4).

## Known Stubs

None. All UI surfaces are wired to real backend queries/mutations. Last-shift recap reads real `getMyLastShiftSummary` (BOM-resolved ballsProduced from Plan 01). ClockInGate checks real `getCurrentOpenShift` for D-04 enforcement. EndOfShiftForm nudge gate uses real `user.userId` + real `openShift._id`.

## User Setup Required

None — pure frontend wiring on backend already deployed via Plan 01.

## Next Phase Readiness

- **Plan 03 (manager staff-performance page)** can proceed immediately. The extended `getStaffPerformanceSummary` from Plan 01 is live; Plan 03 builds the expanded breakdown UI + correction dialog.
- **Plan 04 (tests + docs)** has a ready surface: `RunningTimer.test.tsx` is the first real component test; the 27 backend it.todo scaffolds remain.
- Human UAT: kitchen PIN login → `/kitchen/clock` → tap Clock-In → `/kitchen` with AttendanceStrip → submit shift → nudge → Clock Out → AttendanceStrip disappears.

## Self-Check: PASSED

- `src/hooks/convex/useAttendance.ts` — FOUND
- `src/components/staffAttendance/RunningTimer.tsx` — FOUND
- `src/components/staffAttendance/ClockOutButton.tsx` — FOUND
- `src/components/staffAttendance/ClockOutNudgeDialog.tsx` — FOUND
- `src/components/staffAttendance/AttendanceStrip.tsx` — FOUND
- `src/components/staffAttendance/index.ts` — FOUND
- `src/components/staffAttendance/__tests__/RunningTimer.test.tsx` — FOUND
- `src/pages/ClockInGate.tsx` — FOUND
- Commit `7e41842e` (Task 1) — FOUND in `git log`
- Commit `56d44293` (Task 2) — FOUND in `git log`
- Commit `a80390e9` (Task 3) — FOUND in `git log`
- Commit `978190b5` (api.d.ts regen) — FOUND in `git log`

---
*Phase: 74-staff-attendance*
*Completed: 2026-04-16*
