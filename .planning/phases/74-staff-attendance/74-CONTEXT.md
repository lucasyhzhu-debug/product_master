# Phase 74: Staff Attendance - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Kitchen staff clock-in/out time tracking linked to existing production output (kitchenShiftRecords). Delivers:

1. One-tap PIN-authenticated clock-in/out on the kitchen app (ATT-01)
2. Per-staff production tracking linked to shifts (ATT-02)
3. Monthly attendance summary with hours worked + production output (ATT-03)
4. Manager correction of missed clock-outs with audit trail (ATT-04)

**Out of scope:** Payroll calculation, overtime rules, leave management, break tracking, biometric/device-pinned attendance, GPS/location verification. These are future capabilities.

</domain>

<decisions>
## Implementation Decisions

### Clock-in/out UX

- **D-01:** Gate screen pattern — after PIN login, kitchen staff hit a "Clock In" screen before accessing KitchenViewV2. The gate shows a welcome message, today's time (WIB), one-tap Clock-In button, and last-shift summary ("Yesterday 6h 23m • 42 balls"). After clock-in, staff is routed to KitchenViewV2 and the header shows a running timer with a Clock-Out button.
- **D-02:** No re-authentication on the gate screen. The login PIN already authenticated the user; clock-in is a single tap to satisfy the "one-tap" requirement in ATT-01.
- **D-03:** Clock-in state persists across browser sessions. Refreshing, closing the tab, or even logging out and back in does NOT auto clock-out. Only an explicit Clock-Out action or a manager correction closes a shift.
- **D-04:** If a staff member has an open shift from a prior day (forgot to clock out), block new clock-in with a warning: "You have an open shift from {date}. Please ask a manager to correct it." This prevents 24h+ ghost shifts.
- **D-05:** Multiple clock-in/out cycles per day are allowed (covers lunch breaks, split shifts, leaving and returning). Each cycle is a separate attendance record. Daily hours = sum of all closed sessions for the staff on that date.

### Attendance ↔ Production link

- **D-06:** Attendance and production records are NOT directly linked via foreign key. Join happens at query time on `(date, chefUserId)`. Schema: new `staffAttendance` table with `{ userId, date, clockIn, clockOut, ... }`; existing `kitchenShiftRecords` retains `chefUserId`/`date`. This aligns with existing `getStaffPerformanceSummary` aggregation pattern.
- **D-07:** Submitting a shift record (EndOfShiftForm) without being clocked in is allowed but shows a non-blocking banner: "You're not clocked in — this shift won't count toward your hours." Supports retroactive entries and prep-only days.
- **D-08:** Clock-out action prompts the user with a dialog: "Submit your shift record first?" with options "Submit now" or "Skip and clock out." Non-blocking nudge.
- **D-09:** When a staff has multiple clock sessions in one day, production aggregates to the day total regardless of which session was open when the shift record was submitted. No per-session production attribution (keeps schema + UI simple and aligns with D-06).

### Monthly summary view

- **D-10:** New dedicated route `/staff-performance` (manager/admin only). Permission gate: `canAccessDashboard` or equivalent manager/admin role guard. Adds a nav entry. Reuses existing `getStaffPerformanceSummary` backend query (extended to include hours).
- **D-11:** Default column set: Hours worked, Days worked, Balls produced by type (Big Ball + Mid Ball via BOM resolution), plus dynamic per-component breakdown. Subtotals per component respect each component's native unit (g or pcs) — never sum across units.
- **D-12:** Default period = current month, prev/next month navigation. CSV export action on the page.
- **D-13:** Staff can view their own attendance data: previewed on the gate screen ("Last shift: 6h 23m • 42 balls") and a personal "My Performance" view scoped to their own userId. Manager/admin see all staff.
- **D-14:** Per-shift breakdown UI = expandable row per staff. Expanded view shows a nested table: one row per shift date, dynamic columns — one per tracked component — with unit shown in the column header (e.g., "Big Ball (pcs)", "Outer-Marshmallow (g)"). Bottom TOTAL row gives per-component subtotals in native units. Columns are driven by `kitchenConfig.componentTracking`; components with `tracked: false` are excluded.

### Clock-out correction

- **D-15:** Flagged shifts surface inline on `/staff-performance`. Top-of-page counter "⚠ N shifts need correction" navigates to the first flagged row. In the expanded breakdown, problematic rows show a yellow badge and a "Fix" button.
- **D-16:** Manager capabilities: edit clockIn/clockOut timestamps on any shift, add a missed shift retroactively, delete an erroneous shift, reassign chef to a different user. Correction dialog uses the same UX pattern as `ShiftEditDialog`.
- **D-17:** Audit trail stores before/after values: `correctedAt: number`, `correctedBy: string` (manager name), `correctionNote: string` (required), plus previous state. Pattern mirrors existing `kitchenShiftRecords.editedAt/editedBy/editNote`. If multiple corrections occur on the same record, consider an array of correction entries so full history is preserved.
- **D-18:** Auto-flag rules (all four):
  - Missing clock-out (clockIn set, clockOut null, staff not currently clocked in — e.g., it's a later date)
  - Open shift > 16 hours without clock-out
  - Overlapping sessions for the same staff (two open shifts or overlapping time ranges)
  - Clock-in timestamp before user.hireDate
- **D-19:** Correction note is required — the dialog blocks submission with an empty note. Keeps the audit trail meaningful and aligns with existing `ShiftEditDialog` (which also requires `editNote`).

### Claude's Discretion

- Exact layout of the gate screen (card dimensions, animations, typography) — follow existing kitchen UI style (DashboardHeader, StatCard).
- Storage of "currently clocked-in" state — open shifts query can derive this (clockOut null + same user + most recent), no separate flag needed.
- Exact HH:MM:SS format for the running timer in the header — follow existing dateUtils WIB helpers.
- CSV column order and filename format for the export — reuse `src/lib/csvExport.ts` patterns.
- Whether the `/staff-performance` page uses a "My Performance" tab vs. staff being auto-redirected to their own row — lean on existing UsersManager patterns.
- Exact threshold for "open shift too long" flag rule can be tuned (16h is a starting point).
- Visual treatment of the correction audit trail display — reuse ShiftHistoryList patterns.

### Folded Todos

None — no pending todos matched this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/ROADMAP.md` §"Phase 74: Staff Attendance" — phase goal, dependencies, success criteria
- `.planning/REQUIREMENTS.md` — ATT-01, ATT-02, ATT-03, ATT-04 (checklist items)
- `.planning/REQUIREMENTS.md` — DA-04 (employee profile dependency, already complete)

### Existing production recording (to join with attendance)
- `convex/kitchenShiftRecords/queries.ts` — `getStaffPerformanceSummary` is the existing aggregation query to extend; `getShiftHistory`, `getShiftRecordsByDate`, `getDailyComponentSummary`
- `convex/kitchenShiftRecords/mutations.ts` — `submitShiftRecord`, `updateShiftRecord`; audit-trail pattern (`editedAt`/`editedBy`/`editNote`) to mirror for attendance corrections
- `convex/schema.ts` §"kitchenShiftRecords" — existing table definition to understand how production is recorded
- `src/hooks/convex/useStaffPerformance.ts` — existing hook to extend with hours data
- `src/components/kitchen/EndOfShiftForm.tsx` — where the clock-out prompt (D-08) must integrate
- `src/components/kitchen/ShiftEditDialog.tsx` — the pattern for manager correction dialogs (D-16, D-17)
- `src/components/kitchen/ShiftHistoryList.tsx` — existing history UI to reuse styling
- `src/lib/staffPerformanceExport.ts` — existing CSV export utility to extend

### Kitchen config redesign (componentTracking — critical for D-14)
- `.claude/worktrees/debug-kitchen-dedupe-round2/convex/schema.ts` §kitchenConfig — `componentTracking: { code, tracked, unit }[]` is the single source of truth for which components display and in what unit (g or pcs)
- `.claude/worktrees/debug-kitchen-dedupe-round2/convex/kitchenConfig/queries.ts` — reads `componentTracking` with backward-compat fallback to legacy `enabledProductionComponents`/`enabledKitchenComponents`
- `.claude/worktrees/debug-kitchen-dedupe-round2/convex/kitchenConfig/mutations.ts` — writes `componentTracking`; phase 74 UI must consume this, not the legacy fields
- `.claude/worktrees/debug-kitchen-dedupe-round2/src/components/kitchen/EndOfShiftForm.tsx` — reference implementation of consuming `componentTracking` with `unitByCode` map

### Auth & access control
- `convex/lib/auth.ts` — `requireRole()` helper; `UserRole = "kitchen" | "order_staff" | "manager" | "admin"`
- `convex/auth/queries.ts`, `convex/auth/mutations.ts` — PIN login + DA-04 fields (hireDate, baseSalaryIdr, bankAccountHolderName)
- `src/components/auth/ProtectedRoute.tsx` — route-level permission guard to use for `/staff-performance`
- `src/contexts/AuthContext.tsx` — `useAuth` hook for token access on gate screen

### WIB timezone helpers
- `src/lib/dateUtils.ts` — WIB timezone formatting utilities (6 exports). Use for displaying clock-in/out times and daily rollovers.
- `convex/lib/periodRange.ts` — backend WIB helpers for date range queries.

### Business rules (critical)
- `CLAUDE.md` §"Key Business Rules" #10, #13 — BOM resolution for ball counts. Staff production summary must count actual Big Ball + Mid Ball components, not product quantity.
- `CLAUDE.md` §"Critical Convex Lessons" — index range bounds inside `.withIndex()`; typed `Id<"tableName">`; camelCase fields; static imports only in convex/.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`getStaffPerformanceSummary` query** (`convex/kitchenShiftRecords/queries.ts`) — already aggregates balls/grams/waste/shiftCount/daysWorked per staff. Extend to include `hoursWorked` by joining the new `staffAttendance` table.
- **`useStaffPerformance` hook** (`src/hooks/convex/useStaffPerformance.ts`) — already wires the summary query. Extend its return type to include hours.
- **`ShiftEditDialog` pattern** — manager edit with required note, audit fields (`editedAt`, `editedBy`, `editNote`). Reuse this exact pattern for `attendanceCorrectionDialog`.
- **`DashboardHeader`** (`src/components/kitchen/DashboardHeader.tsx`) — existing kitchen header to host the Clock-Out button + running timer when user is clocked in.
- **`requireRole`** (`convex/lib/auth.ts`) — use for gating the new correction mutation (manager/admin) and staff-performance queries.
- **CSV export utility** (`src/lib/staffPerformanceExport.ts`, `src/lib/csvExport.ts`) — extend for attendance export; don't rebuild.
- **WIB time helpers** (`src/lib/dateUtils.ts`, `convex/lib/periodRange.ts`) — use for all date formatting and range queries.
- **componentTracking config** (kitchenConfig) — drives dynamic columns in the performance view (D-14). Read `unitByCode` map exactly as EndOfShiftForm does.

### Established Patterns
- **Protected mutations take `token: v.string()`** and use `requireRole` at the top of the handler. New `clockIn`, `clockOut`, `correctAttendance` mutations all follow this.
- **Date strings are YYYY-MM-DD** in WIB (see kitchenShiftRecords). Use `toWibDateString` pattern when writing date-keyed records.
- **Queries return enriched data** (name lookups pre-joined). Follow the Map-based batch-fetch pattern in `getStaffPerformanceSummary`.
- **Schema indexes for queries** — add `by_user_date` and `by_date_status` (or similar) on `staffAttendance` to support the staff-performance aggregation and the flagged-shift query efficiently.
- **Worktree note**: the componentTracking redesign lives in `.claude/worktrees/debug-kitchen-dedupe-round2/`. When it merges to main, the main-tree files will have the same shape. Plan on it being merged before phase 74 implementation, or target the worktree if still active at plan time.

### Integration Points
- **Router** (`src/App.tsx`) — add `<Route path="/staff-performance">` with `<ProtectedRoute>` and manager/admin guard.
- **Nav menu** — add "Staff Performance" entry for manager/admin users.
- **Login flow** → after successful PIN login, route kitchen-role users to the new gate screen instead of directly to `/kitchen`. Manager/admin continue to their current destination.
- **EndOfShiftForm** — on submission success, if user has an open attendance session, prompt for clock-out (D-08).
- **Header** — once clocked in, `DashboardHeader` shows a running timer + Clock-Out button. When clocked out, shows a normal header.

</code_context>

<specifics>
## Specific Ideas

- **Gate screen layout:** Welcome greeting with staff's name, current WIB time, giant one-tap Clock-In button (or Clock-Out if already clocked in), and a "Last shift" recap card below showing yesterday's hours + balls produced. Minimal cognitive load — anyone should be able to clock in within 2 seconds of seeing the screen.
- **Running timer format:** `⏱ 2h 15m` in the header (minute-resolution is fine; second-level precision is overkill for kitchen work).
- **Flag threshold "open shift > 16h":** Starting value. If the team regularly works legitimate 14-16h shifts, this can be tuned. Expose as a constant in `convex/staffAttendance/constants.ts` for easy adjustment.
- **Per-shift breakdown columns:** Column headers include the unit in parentheses — `Big Ball (pcs)`, `Outer-Marshmallow (g)`. This prevents visual confusion when a user glances at a row with mixed-unit components.
- **Block-on-prior-open-shift message:** "You have an open shift from {date}. Please ask a manager to correct it." Provide a "Notify Manager" button that opens a pre-filled WhatsApp/SMS link — nice-to-have, not required for v1.

</specifics>

<deferred>
## Deferred Ideas

- **Biometric/device-pinned attendance** — verifying clock-in from a specific kitchen tablet or via fingerprint. Out of scope; PIN + optional manager review is sufficient.
- **GPS/location verification** — kitchen is a fixed location but this adds complexity and privacy questions.
- **Overtime calculation and payroll integration** — hours worked is exposed, but converting to IDR pay with overtime rules belongs in a future payroll milestone.
- **Break tracking** — differentiating paid vs. unpaid breaks. Current model assumes all clocked-in time is paid.
- **Leave management** — vacation, sick days, approval workflows. Separate domain.
- **Auto clock-out at midnight or after inactivity** — considered and rejected (D-03). Could revisit if forgotten clock-outs become a chronic problem.
- **Inline clock-out correction from the kitchen gate screen** — considered for D-15. Rejected because it couples manager and staff device sessions; the flagged-list pattern on /staff-performance is cleaner.
- **Bulk corrections** — fix multiple shifts at once. Not needed for v1; per-shift correction is adequate.
- **Email/push notifications to managers when a flag appears** — current model is pull (manager checks the page). Push is future polish.
- **Per-session production attribution (vs. sum to the day, D-09)** — if accounting ever needs to split production by session (e.g., different hourly rates for different shifts), revisit the schema then.
- **Shift scheduling / rostering** — "who's supposed to be clocked in now" — separate scheduling domain.
- **"Notify Manager via WhatsApp" button on the blocked clock-in screen** — nice-to-have polish, flagged in Specifics.

### Reviewed Todos (not folded)

None — no pending todos matched this phase during cross-reference.

</deferred>

---

*Phase: 74-staff-attendance*
*Context gathered: 2026-04-16*
