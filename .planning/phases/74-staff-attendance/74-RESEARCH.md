# Phase 74: Staff Attendance — Research

**Researched:** 2026-04-16
**Domain:** Kitchen staff clock-in/out (time tracking) + join with existing production records for performance visibility
**Confidence:** HIGH (codebase fully explored; all canonical refs verified)

## Summary

Phase 74 adds a new `staffAttendance` table + 3 mutations (`clockIn`, `clockOut`, `correctAttendance`) and extends the existing `/staff-performance` page with hours-worked data. The plumbing already exists:

- `/staff-performance` route, `StaffPerformance` page, `useStaffPerformance` hook, `getStaffPerformanceSummary` query, CSV export, and nav entries are all **already live** on main (see `src/App.tsx:472-479`, `src/components/layout/Header.tsx:111`).
- Phase 74 extends them — it does not create them from scratch.

The main new surfaces are: (1) a gate screen after PIN login for kitchen-role users; (2) a running-timer + Clock-Out button in `DashboardHeader`; (3) a correction dialog modeled on `ShiftEditDialog`; (4) the `staffAttendance` backend.

**CRITICAL dependency:** D-14 "dynamic columns driven by `kitchenConfig.componentTracking`" targets a field that **does NOT exist on main** — it lives only in `.claude/worktrees/debug-kitchen-dedupe-round2/`. Plans must either (a) depend on that worktree being merged before execution, or (b) fall back to the legacy `enabledProductionComponents`/`enabledKitchenComponents` arrays that DO exist on main (`convex/schema.ts:1361-1365`).

**Primary recommendation:** Single backend plan (schema + mutations + extend `getStaffPerformanceSummary`), one gate-screen + header plan, one correction-dialog plan, one test plan. Target ~4 plans.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01..D-19)

**Clock-in/out UX:**
- **D-01:** Gate screen after PIN login for kitchen-role users. Shows welcome, WIB time, one-tap Clock-In button, last-shift summary. Post clock-in → KitchenViewV2 with running timer + Clock-Out in header.
- **D-02:** No re-auth on gate screen (PIN login already authenticated).
- **D-03:** Clock-in state persists across browser sessions — only explicit Clock-Out or manager correction closes a shift.
- **D-04:** Prior-day open shift blocks new clock-in ("You have an open shift from {date}. Please ask a manager to correct it.").
- **D-05:** Multiple clock-in/out cycles per day allowed. Daily hours = sum of all closed sessions.

**Attendance ↔ Production link:**
- **D-06:** NOT FK-linked. Join at query time on `(date, chefUserId)`. New `staffAttendance` table. Existing `kitchenShiftRecords` unchanged.
- **D-07:** Submitting shift record without being clocked in shows non-blocking banner ("You're not clocked in — this shift won't count toward your hours.").
- **D-08:** Clock-out dialog after EndOfShiftForm submit: "Submit your shift record first?" — non-blocking nudge.
- **D-09:** Multi-session production aggregates to day total. No per-session production attribution.

**Monthly summary view:**
- **D-10:** New route `/staff-performance` (manager/admin only) — **ALREADY EXISTS** on main. Permission: `canAccessDashboard`.
- **D-11:** Columns: Hours worked, Days worked, Balls produced by type (BOM-resolved), per-component breakdown. Subtotals in native units (never sum g + pcs).
- **D-12:** Default period = current month. Prev/next navigation. CSV export.
- **D-13:** Staff viewing own data: gate-screen last-shift preview + personal "My Performance" scoped to own userId.
- **D-14:** Per-shift breakdown = expandable row. Columns driven by `kitchenConfig.componentTracking` (unit in header: "Big Ball (pcs)", "Outer-Marshmallow (g)"). **⚠ Depends on worktree merge.**

**Clock-out correction:**
- **D-15:** Flagged shifts surface inline on `/staff-performance`. Top-of-page counter "⚠ N shifts need correction". Fix button on flagged rows.
- **D-16:** Manager can edit clockIn/clockOut, add missed shift, delete, reassign chef. Dialog mirrors `ShiftEditDialog`.
- **D-17:** Audit trail: `correctedAt`, `correctedBy`, `correctionNote` (required), plus previous state. Multiple corrections → array of entries.
- **D-18:** Auto-flag rules (all four):
  - Missing clock-out (clockIn set, clockOut null, not currently clocked in)
  - Open shift > 16h without clock-out
  - Overlapping sessions
  - Clock-in before `user.hireDate`
- **D-19:** Correction note required (blocks submission if empty). Mirrors `ShiftEditDialog.editNote` pattern.

### Claude's Discretion

- Exact gate screen layout (follow DashboardHeader/StatCard styling)
- How "currently clocked-in" is derived — open shift = `clockOut = undefined`, no separate flag
- Running timer format (follow `dateUtils` WIB helpers)
- CSV column order and filename format
- Whether `/staff-performance` uses a "My Performance" tab vs. auto-redirect to own row
- 16h flag threshold is tunable (constant in `convex/staffAttendance/constants.ts`)
- Correction audit trail display (reuse `ShiftHistoryList` patterns)

### Deferred Ideas (OUT OF SCOPE)

Biometric attendance, GPS verification, overtime/payroll integration, break tracking, leave management, auto clock-out at midnight, inline clock-out correction from gate screen, bulk corrections, push/email notifications, per-session production attribution, shift scheduling/rostering, "Notify Manager via WhatsApp" button.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **ATT-01** | Kitchen staff can clock in/out via one-tap PIN-authenticated interface | Gate screen (D-01, D-02) + `clockIn`/`clockOut` mutations using `useProtectedMutation` pattern. No re-auth; session token already provides identity. |
| **ATT-02** | Per-staff production tracking shows balls by type and grams from shift records | Already implemented in `getStaffPerformanceSummary` (`convex/kitchenShiftRecords/queries.ts:330-557`) via BOM resolution. Extend return shape to include `hoursWorked`. |
| **ATT-03** | Monthly attendance summary with hours worked + production output per staff | Extend existing `StaffPerformance` page (`src/pages/StaffPerformance.tsx`). Add hours column, reuse month picker, extend CSV. |
| **ATT-04** | Manager can correct missed clock-outs with audit trail | New `correctAttendance` mutation + dialog modeled on `ShiftEditDialog` (D-16..D-19). Audit fields mirror `editedAt`/`editedBy`/`editNote`. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Branch-per-phase:** Phase 74 runs on `feature/74-staff-attendance` (or current `gsd/phase-74-*`). Never branch from another feature branch — `git switch main && git pull` first.
- **Build gate:** `npm run build` (tsc + vite build) must pass before merge. Use `npm run type-check` to iterate faster.
- **Git:** No direct commits to main. Update `docs/CHANGELOG.md` after every merge. Update `docs/SCHEMA.md` if schema changes (it will — new `staffAttendance` table).
- **Planning template (mandatory 4 sections):** Git Workflow, Implementation Waves, Documentation Updates, Success Criteria.
- **Access control:** All new routes use `<ProtectedRoute>`. Protected mutations take `token: v.string()` and use `requireRole(ctx, args.token, [...])`.
- **Naming:** camelCase in Convex (`chefUserId`, `clockIn`). Typed `Id<"tableName">`.
- **BOM / ball counting (rule #10, #13):** Ball type/count MUST derive from `menuProductComponents` + `componentTypes` (category="production", code="BIG_BALL" or "MID_BALL"). NEVER use deprecated `productionType`/`productionUnits`. `getStaffPerformanceSummary` already does this correctly (lines 353-386).
- **No dynamic imports in Convex** — static imports only.
- **Convex index bounds:** both lte/gte bounds must be inside `.withIndex()`, not `.filter()`.
- **Windows path safety:** phase dir name short (`74-staff-attendance` is fine — 19 chars).

## Standard Stack

All versions verified in the codebase. No new dependencies needed.

### Core (already installed)

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| Convex | ^1.31.7 | Backend + reactive queries | `package.json` [VERIFIED] |
| React | ^19.2.0 | UI | [VERIFIED] |
| TypeScript | ~5.9 | Types | [VERIFIED] |
| shadcn/ui | — | Dialog, Table, Badge, Collapsible, Accordion | `src/components/ui/` [VERIFIED] |
| Lucide React | — | Icons (Clock, UserCheck, AlertTriangle) | [VERIFIED] |
| Sonner | — | Toast notifications | [VERIFIED] |
| date-fns + date-fns/locale/id | — | Indonesian locale formatting | `src/lib/dateUtils.ts:8-9` [VERIFIED] |
| Vitest + convex-test | ^4.0.18 | Unit/integration tests | `vitest.config.ts` [VERIFIED] |

**No new dependencies required.** Phase 74 is pure application code on the existing stack.

## Architecture Patterns

### File Layout

```
convex/staffAttendance/
├── schema.ts           # (implicit — added to convex/schema.ts)
├── mutations.ts        # clockIn, clockOut, correctAttendance
├── queries.ts          # getCurrentOpenShift, getAttendanceForStaff, getFlaggedShifts
├── flagEngine.ts       # Pure functions: detectFlags(record, allSessionsForUser, hireDate, now)
├── constants.ts        # OPEN_SHIFT_THRESHOLD_MS = 16 * 60 * 60 * 1000
└── __tests__/
    ├── clockIn.test.ts
    ├── clockOut.test.ts
    ├── correctAttendance.test.ts
    └── flagEngine.test.ts

src/components/staffAttendance/
├── ClockInGate.tsx              # Gate screen (D-01)
├── RunningTimer.tsx             # Live HH:MM tick in DashboardHeader (D-01)
├── ClockOutButton.tsx           # Button in DashboardHeader
├── ClockOutNudgeDialog.tsx      # D-08 post-EndOfShiftForm dialog
├── AttendanceCorrectionDialog.tsx  # D-15, D-16, D-17, D-19
├── FlaggedShiftsBanner.tsx      # Top-of-page "⚠ N shifts need correction"
└── index.ts

src/hooks/convex/
└── useAttendance.ts             # useCurrentOpenShift, useFlaggedShifts, useMyAttendance

src/lib/
└── attendanceExport.ts          # Extend staff CSV with hours column
```

### Pattern 1: Protected Mutation with `requireRole` + token destructure

Used for all 3 new mutations. Exact pattern from `convex/kitchenShiftRecords/mutations.ts:73-80, 350-352`:

```typescript
// Source: convex/kitchenShiftRecords/mutations.ts
export const clockIn = mutation({
  args: {
    token: v.string(),
    // userId optional — defaults to session user
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, [
      "kitchen", "order_staff", "manager", "admin",
    ]);
    const targetUserId = args.userId ?? user._id;
    // ... logic uses user.name, user._id for audit fields
  },
});
```

Frontend invocation pattern from `src/components/kitchen/ShiftEditDialog.tsx:85-87, 307-308`:

```typescript
const clockIn = useProtectedMutation(api.staffAttendance.mutations.clockIn);
await clockIn({}); // token auto-injected by useProtectedMutation
```

`useProtectedMutation` strips `token` from required args (see `src/hooks/convex/useProtectedMutation.ts:46-56`).

### Pattern 2: WIB date strings (YYYY-MM-DD)

All date-keyed records (including `staffAttendance.date`) use YYYY-MM-DD in WIB. Established by `kitchenShiftRecords` (`convex/schema.ts:1396`, `convex/kitchenShiftRecords/queries.ts:260-266`):

```typescript
// Source: convex/kitchenShiftRecords/queries.ts:261-266
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const nowWib = new Date(Date.now() + WIB_OFFSET_MS);
function toWibDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
```

Frontend equivalents: `utcToWibDateStr`, `utcToWibTimeStr`, `getCurrentWibMonth`, `formatIndonesianDate` in `src/lib/dateUtils.ts:60-131`.

### Pattern 3: Enriched query returns with pre-joined lookups

`getStaffPerformanceSummary` (lines 354-386) uses a Map-based batch-fetch pattern to avoid N+1 reads. Apply the same pattern when joining attendance with shift records: fetch `staffAttendance` for the range, bucket by `(userId, date)`, compute hours per bucket, and merge into the existing staff aggregation.

### Anti-Patterns to Avoid

- **Don't add a `currentlyClockedIn` flag to `users`.** Derive from the latest attendance row with `clockOut = undefined` (D-02 Discretion).
- **Don't FK-link `staffAttendance.shiftRecordId`.** D-06 is explicit — join at query time on `(date, chefUserId)`.
- **Don't sum component units across g and pcs (D-11).** Each component has its own unit. Subtotals must stay native.
- **Don't trigger flag detection on every write.** Flags are derived at read time — see Pitfall 1.
- **Don't shadow legacy `enabledProductionComponents`/`enabledKitchenComponents`.** The worktree `componentTracking` is a *superset* — when it's merged, the legacy arrays remain as back-compat fallback (`convex/schema.ts:1361-1365`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth/token flow | Custom session in gate screen | `useProtectedMutation` + `useAuth().user.token` | Already solved; re-auth forbidden by D-02 |
| Running timer display | `setInterval` on clock time in header | Client-side `setInterval(() => setNow(Date.now()), 60_000)` — minute resolution is enough (D-01 Discretion says "minute-resolution is fine; second-level precision is overkill") | Backend tick is not needed; minute precision reduces re-render cost |
| Manager correction UI | New dialog from scratch | Copy `ShiftEditDialog.tsx` structure (step = input → review → confirm) | Same UX mental model; D-16 requires it |
| Audit trail fields | New field names | Mirror `editedAt`/`editedBy`/`editNote` as `correctedAt`/`correctedBy`/`correctionNote` | D-17 explicit |
| CSV export | New export util | Extend `src/lib/staffPerformanceExport.ts` (add Hours column) | D-12; existing code already handles totals + footer metadata |
| Collapsible breakdown | Hand-rolled toggle | Already in `StaffDetailRow` (`src/pages/StaffPerformance.tsx:66-195`) + `src/components/ui/collapsible.tsx` / `accordion.tsx` available | Verified in `src/components/ui/` |
| Month picker | Custom | Existing `<input type="month">` pattern (`src/pages/StaffPerformance.tsx:43-64`) | Already idiomatic in the codebase |
| BOM ball counting | Redo BOM resolution | Keep using `getStaffPerformanceSummary`'s existing logic (lines 353-386) | Already correct per rule #10/#13 |

## Runtime State Inventory

> Phase 74 is **primarily greenfield** (new table, new mutations). No rename/migration/refactor. The items below are the few runtime touches:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None.** `staffAttendance` is a new table. No existing production data needs backfill (pre-phase shifts simply have no attendance records — which is the correct representation of "didn't clock in"). | None |
| Live service config | **None.** No n8n workflows, Datadog dashboards, or external services touch attendance. | None |
| OS-registered state | **None.** No cron jobs exist today (`convex/crons.ts` has 2 unrelated crons). Flag detection is query-time, not cron-based. | None |
| Secrets/env vars | **None.** No new env vars. Session tokens already flow through `useProtectedMutation`. | None |
| Build artifacts | **None.** Purely application code; no generated files outside Convex's `_generated/`. | None |

## Schema Architecture Design

### Proposed `staffAttendance` Table

Single-record-per-session schema (preferred over "flat latest correction" for D-17 multi-correction support):

```typescript
// Add to convex/schema.ts after kitchenShiftRecords (~line 1445)
staffAttendance: defineTable({
  userId: v.id("users"),                     // FK to users
  date: v.string(),                          // YYYY-MM-DD in WIB — the clock-in day
  clockIn: v.number(),                       // Epoch ms, UTC
  clockOut: v.optional(v.number()),          // Epoch ms; undefined ⇒ open shift
  durationMs: v.optional(v.number()),        // Denormalized: clockOut - clockIn; set on close (enables fast sum)

  // Audit trail (D-17): array preserves full history for multi-correction scenarios
  corrections: v.optional(v.array(v.object({
    correctedAt: v.number(),
    correctedBy: v.string(),                 // Manager name snapshot
    correctedByUserId: v.id("users"),
    correctionNote: v.string(),              // Required (D-19)
    // Before values (post-correction values are the current doc's clockIn/clockOut)
    previousClockIn: v.optional(v.number()),
    previousClockOut: v.optional(v.number()),
    previousUserId: v.optional(v.id("users")),  // If chef reassigned (D-16)
    action: v.union(                          // What kind of correction
      v.literal("edit_timestamps"),
      v.literal("add_missed"),
      v.literal("reassign"),
      v.literal("delete"),                    // For soft-delete; see Pitfall 2
    ),
  }))),

  // Soft-delete flag (D-16 "delete an erroneous shift")
  deletedAt: v.optional(v.number()),
  deletedBy: v.optional(v.string()),
})
  .index("by_user_date", ["userId", "date"])          // Primary lookup: "sessions for user X on day Y"
  .index("by_user_open", ["userId", "clockOut"])      // Open-shift query: clockOut=undefined filter
  .index("by_date", ["date"])                         // Range scan for /staff-performance monthly view
```

**Index rationale:**
- `by_user_date`: supports "does this user already have an open shift today?" and "give me today's last shift for this user" — the gate-screen query fires this on every kitchen-role load.
- `by_user_open`: `ctx.db.query("staffAttendance").withIndex("by_user_open", q => q.eq("userId", uid).eq("clockOut", undefined)).first()` returns the current open shift in O(1). Convex index range bounds rule (CLAUDE.md Critical Lesson): both `userId` and `clockOut` must be inside `withIndex()`, which this satisfies.
- `by_date`: range scan for monthly/period queries joined with `kitchenShiftRecords`.

**Deliberately NOT indexed:** `by_date_flagged` — flags are computed, not stored. See Pitfall 1.

### hireDate interaction (Q3, D-18 rule 4)

`users.hireDate` is `v.optional(v.number())` (`convex/schema.ts:469`). Legacy users (pre-DA-04) have `hireDate = undefined`. **Rule:** if `hireDate` is undefined, skip the "clock-in before hireDate" flag (do not fire false-positives on legacy users). Document this in `flagEngine.ts`:

```typescript
// Source: derived from CLAUDE.md + schema inspection
export function flagClockInBeforeHire(clockIn: number, hireDate: number | undefined): boolean {
  if (hireDate === undefined) return false;  // Legacy user — skip rule
  return clockIn < hireDate;
}
```

### Correction history: array vs. triplet (Q2)

**Recommendation: array of correction entries (shown above).** Rationale:

1. D-17 explicitly says "consider an array of correction entries so full history is preserved" for multi-correction scenarios.
2. Manager may correct a forgotten clock-out on Monday, then realize on Tuesday the clockIn was wrong too — two separate audits of the same record.
3. Convex arrays on `v.optional(v.array(v.object({...})))` serialize fine; there's no meaningful performance penalty until >~100 entries per record (which won't happen in practice).
4. The existing `kitchenShiftRecords` uses flat `editedAt`/`editedBy`/`editNote` because KIT-17 only needs last-edit visibility — attendance corrections are more sensitive (payroll-adjacent) and benefit from the full log.

**Compromise option** (if planner wants simpler): flat triplet `correctedAt`/`correctedBy`/`correctionNote` on the record + push a summary row into a separate `attendanceCorrectionLog` table. Heavier schema, but cleaner read queries. Default to the array unless planner justifies otherwise.

## Clock-In/Out Flow Design

### Q4: Post-login routing — least-invasive hook point

Current flow: `Login.tsx:30-35` runs `navigate(getRoleLandingPage(user.role))` in a `useEffect` after successful login. `getRoleLandingPage` (`src/lib/types.ts:838-846`) returns `/kitchen` for kitchen-role.

**Recommended hook: `getRoleLandingPage` in `src/lib/types.ts`.**

Change `kitchen: "/kitchen"` → `kitchen: "/kitchen/clock"` and add a new route in `App.tsx`:

```tsx
// In App.tsx inside <Route element={<Layout fullWidth />}>
<Route
  path="kitchen/clock"
  element={
    <ProtectedRoute requiredPermission="canAccessKitchen">
      <ClockInGate />
    </ProtectedRoute>
  }
/>
```

The gate screen itself routes onward to `/kitchen` after successful clock-in. Manager/admin/order_staff paths are unaffected because their landing pages aren't changed.

Additionally, `RoleBasedRedirect` in `App.tsx:617-625` must route `kitchen` role to `/kitchen/clock` (it currently hardcodes `/kitchen`). Keep the logic co-located in that function to prevent drift.

**Why not gate inside KitchenViewV2?** Because D-01 says "After clock-in, staff is routed to KitchenViewV2 and the header shows a running timer" — the gate must be a separate screen, not a modal on top of KitchenViewV2.

### Q5: Deriving "currently clocked-in"

No flag needed (Claude's Discretion). The gate screen queries:

```typescript
// convex/staffAttendance/queries.ts
export const getCurrentOpenShift = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["kitchen","order_staff","manager","admin"]);
    return await ctx.db
      .query("staffAttendance")
      .withIndex("by_user_open", q => q.eq("userId", user._id).eq("clockOut", undefined))
      .first();
  },
});
```

O(1) with `by_user_open` index. Convex queries are reactive — when the user clocks out, the gate screen (if re-visited via browser back) sees the change automatically.

### Q6: D-04 blocker vs D-18 "> 16h open" flag — sequencing

These are **different conditions that both catch forgotten clock-outs**, at different stages:

- **D-04 blocker** fires at the moment of new clock-in. Rule: if `getCurrentOpenShift(userId)` returns a row with `date < today (WIB)`, block the new clock-in.
- **D-18 "> 16h open" flag** is derived at query time on `/staff-performance`. Rule: `clockOut === undefined && (Date.now() - clockIn) > 16h`. Shows as a `needsCorrection` marker in the data.

Both point to the same user-visible outcome: "something's wrong, manager must fix." D-04 is the *preventive* gate (don't let the user stack a second open shift). D-18 is the *detective* control for the manager's dashboard.

**Sequencing inside `clockIn` mutation:**

1. `requireRole`
2. Find open shift: `getCurrentOpenShiftInternal(userId)`
3. If found AND `openShift.date < todayWib`: throw `ConvexError("You have an open shift from ${openShift.date}. Please ask a manager to correct it.")`
4. If found AND `openShift.date === todayWib`: throw `ConvexError("You're already clocked in.")` (user probably refreshed)
5. Otherwise: insert new `staffAttendance` row with `clockOut = undefined`.

### Q7: Running timer — client setInterval vs. backend tick

**Recommend client `setInterval(..., 60_000)`**. Minute precision is explicitly fine (D-01 Discretion: "minute-resolution is fine; second-level precision is overkill"). No backend tick exists anywhere in the codebase. Implementation:

```tsx
// src/components/staffAttendance/RunningTimer.tsx
export function RunningTimer({ clockIn }: { clockIn: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const elapsedMs = now - clockIn;
  const h = Math.floor(elapsedMs / 3_600_000);
  const m = Math.floor((elapsedMs % 3_600_000) / 60_000);
  return <span className="tabular-nums">⏱ {h}h {m}m</span>;
}
```

No existing "live clock" pattern was found in the codebase — this is a net-new primitive.

## Attendance ↔ Production Integration

### Q8: `getStaffPerformanceSummary` return shape change

Current return (`convex/kitchenShiftRecords/queries.ts:550-557`):

```typescript
{
  startDate: string;
  endDate: string;
  totalRecords: number;
  staff: Array<{
    staffKey, chefName, chefUserId,
    totalBallsProduced, productBreakdown,
    totalComponentGrams, componentBreakdown,
    totalComponentWasteGrams, componentWasteBreakdown,
    totalWaste, wasteByReason, wasteProductBreakdown,
    shiftCount, daysWorked,
  }>;
}
```

**Additive extension** — no breaking changes:

```typescript
// New fields per staff record
{
  // ... existing fields ...
  totalHoursWorked: number;        // Sum of durationMs across all closed sessions in range / 3_600_000
  daysAttended: number;            // Distinct dates where user has at least one clock-in
  flaggedShiftCount: number;       // Count of attendance rows in range that fail any D-18 rule
  perDayBreakdown: Array<{          // For D-14 expandable row
    date: string;                  // YYYY-MM-DD
    hoursWorked: number;
    sessions: Array<{
      attendanceId: Id<"staffAttendance">;
      clockIn: number;
      clockOut: number | null;
      durationMs: number | null;
      isFlagged: boolean;
      flagReasons: string[];       // ["missing_clockout", "over_16h", "overlapping", "before_hire"]
    }>;
    componentTotals: Array<{       // Per-component production for that day
      code: string;
      name: string;
      unit: "g" | "pcs";            // From componentTracking (or fallback heuristic — see Q10)
      quantity: number;             // Matches the unit
    }>;
    ballsProduced: number;          // Total BOM-resolved balls that day
  }>;
}
```

**Implementation approach:**
- Range-scan `staffAttendance` by `by_date` for `[startDate, endDate]`.
- Bucket by `userId` → by `date` → array of sessions.
- Compute `totalHoursWorked` = sum of `durationMs` (treating `undefined` durations as 0 — open shifts don't count toward paid hours until closed).
- Compute `daysAttended` from the date Set.
- Merge into existing `staffMap` using the same key (prefer `chefUserId`, fallback `chefName`).
- For `perDayBreakdown`, walk the date-bucketed map and join with per-date shift records.

**Avoiding breaking consumers:** `src/hooks/convex/useStaffPerformance.ts:24-28` re-exports `StaffPerformanceData` from the query's return type — adding fields is transparent. `src/lib/staffPerformanceExport.ts:43-57` reads specific fields by name — it only breaks if you *remove* or *rename* fields. All changes here are additive.

### Q9: D-08 post-submit callback infrastructure

`EndOfShiftForm` uses `step` state (`src/components/kitchen/EndOfShiftForm.tsx:72, 117`) with `"input" | "review" | "success"`. After mutation success it calls `setStep("success")` (line 347) and renders `<ShiftSuccessScreen>` (lines 376-394).

**Integration point:** add an optional `onSubmitted?: () => void` prop. Call it right after `setStep("success")` at line 347. KitchenViewV2 passes a handler that opens `<ClockOutNudgeDialog>`.

Alternative (cleaner): drive it through the parent by watching the session state. Simpler: the prop callback. No existing post-submit callback infrastructure — this is net-new but trivial (<5 lines).

```typescript
// EndOfShiftForm.tsx diff
interface EndOfShiftFormProps {
  // ... existing ...
  onSubmitted?: () => void;  // NEW
}
// After setStep("success") at line 347:
onSubmitted?.();
```

### Q10: D-14 worktree dependency — CRITICAL

**VERIFIED by filesystem inspection:**
- `componentTracking` field exists in `.claude/worktrees/debug-kitchen-dedupe-round2/convex/schema.ts:1379-1383` [VERIFIED].
- `componentTracking` does NOT exist in main's `convex/schema.ts:1347-1368` [VERIFIED — only `enabledProductionComponents` and `enabledKitchenComponents`].
- Worktree was last modified 2026-04-16 12:35, same day as this research. Worktree is active but NOT merged.

**Main-tree shape (fallback):**
```typescript
// convex/schema.ts:1361-1365
enabledProductionComponents: v.optional(v.array(v.string())),  // ["BIG_BALL", "MID_BALL"]
enabledKitchenComponents: v.optional(v.array(v.string())),     // ["OUTER_MARSHMALLOW", ...]
```

Both are just code arrays — there's no per-component unit metadata. Units must be inferred from `componentTypes.unit` (`convex/schema.ts` for componentTypes table — standard component type has its own unit field) and `kitchenComponents.unit` (`convex/schema.ts:1381` — always `"g"`).

**Recommended plan structure:**

| Scenario | Plan approach |
|----------|---------------|
| Worktree merges to main **before** Phase 74 execution starts | Use `componentTracking` directly. Columns driven by `{ code, tracked, unit }` tuples. Clean. |
| Worktree is still unmerged at execution time | Adapter function in `src/hooks/convex/useAttendance.ts` reads `kitchenConfig.componentTracking` first; if `undefined`, falls back to `enabledProductionComponents + enabledKitchenComponents` and derives `unit` from each component's native `unit` field. |

Plans should include the adapter regardless — it's ~20 lines and future-proof. Recommend planner flag the worktree merge as an **explicit precondition** in the Git Workflow section of the first plan.

## Auth & Permissions

### Q11: `canAccessDashboard` as the `/staff-performance` gate

**VERIFIED:** `canAccessDashboard` is defined in `src/lib/types.ts:710`. Values:
- `kitchen`: false (line 733)
- `order_staff`: false (line 756)
- `manager`: true (line 779)
- `admin`: true (line 802)

Matches D-10's "manager/admin only" requirement. The existing `/staff-performance` route in `App.tsx:475` already uses `requiredPermission="canAccessDashboard"` — no change needed.

### Q12: "My Performance" for staff viewing own data (D-13)

**Recommendation: no new permission, just a new route/view scoped by userId from session.**

Two sub-decisions:

1. **Gate screen preview** ("Last shift: 6h 23m • 42 balls"): a dedicated query `getMyLastShiftSummary` that pulls the session user's latest closed `staffAttendance` + joins same-day production. Gate screen queries it; no permission check needed beyond session.

2. **Personal "My Performance" page**: either
   - (a) Reuse `/staff-performance` and auto-filter to self if role is kitchen/order_staff (simpler), OR
   - (b) New route `/my-performance` (cleaner separation).

   **Recommend (b).** Rationale: `/staff-performance` query currently requires `requireRole(ctx, token, ["manager","admin"])` (line 337). Allowing kitchen role would require either weakening that check or adding a per-user conditional. A separate query `getMyPerformance` that calls `requireRole(ctx, token, ["kitchen","order_staff","manager","admin"])` and hard-filters to `user._id` is explicit and safe.

### Q13: Token pattern for the 3 new mutations

Exact template from `convex/kitchenShiftRecords/mutations.ts:73-81, 350-352`:

```typescript
// clockIn — all roles who clock in (kitchen staff primarily)
export const clockIn = mutation({
  args: {
    token: v.string(),
    userId: v.optional(v.id("users")),  // Manager can clock in on someone's behalf via correctAttendance
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, [
      "kitchen", "order_staff", "manager", "admin",
    ]);
    const { token: _, userId: _u, ...rest } = args;  // Destructure pattern (CLAUDE.md Convex example)
    const targetUserId = args.userId ?? user._id;
    // ... D-04 blocker check ...
    // ... insert staffAttendance row ...
  },
});

// clockOut — same role set
export const clockOut = mutation({
  args: { token: v.string(), attendanceId: v.id("staffAttendance") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, [
      "kitchen","order_staff","manager","admin",
    ]);
    const record = await ctx.db.get(args.attendanceId);
    if (!record) throw new ConvexError("Attendance record not found");
    // Only self-clockout unless manager/admin (enforced here, not via role)
    if (record.userId !== user._id && !["manager","admin"].includes(user.role)) {
      throw new ConvexError("Cannot clock out another user's shift");
    }
    // ... patch with clockOut + durationMs ...
  },
});

// correctAttendance — manager/admin only
export const correctAttendance = mutation({
  args: {
    token: v.string(),
    attendanceId: v.optional(v.id("staffAttendance")),  // Omit to add a new missed shift
    userId: v.optional(v.id("users")),                  // For chef reassignment or add
    date: v.optional(v.string()),
    clockIn: v.optional(v.number()),
    clockOut: v.optional(v.number()),
    action: v.union(
      v.literal("edit_timestamps"),
      v.literal("add_missed"),
      v.literal("reassign"),
      v.literal("delete"),
    ),
    correctionNote: v.string(),  // REQUIRED per D-19 — enforced by v.string() (not optional)
  },
  handler: async (ctx, args) => {
    const manager = await requireRole(ctx, args.token, ["manager","admin"]);
    if (args.correctionNote.trim().length === 0) {
      throw new ConvexError("Correction note is required");
    }
    // ... branch on args.action ...
  },
});
```

## Flag Rules & Correction Workflow

### Q14: D-18 overlapping-sessions algorithm

With D-05 allowing multi-cycle per day, "overlapping" means true time-range intersection, not just multiple sessions. Algorithm:

```typescript
// convex/staffAttendance/flagEngine.ts
export function detectOverlaps(sessions: Session[]): string[] {
  // sessions already sorted by clockIn ascending
  const flagged: string[] = [];
  for (let i = 1; i < sessions.length; i++) {
    const prev = sessions[i - 1];
    const cur = sessions[i];
    // Prev must be closed to compare end; open shifts are always overlapping with anything after
    const prevEnd = prev.clockOut ?? Infinity;
    if (prevEnd > cur.clockIn) {
      flagged.push(prev._id, cur._id);
    }
  }
  return [...new Set(flagged)];
}
```

**Key call-out:** if `prev.clockOut === undefined` (open shift), *any* subsequent session overlaps by definition. That's correct — it catches "clocked in twice without clocking out". Lunch breaks are clean: session ends at 12:00, next starts at 13:00 — no overlap because `prev.clockOut (12:00) < cur.clockIn (13:00)`.

### Q15: "> 16h open" detection — query-time vs. cron

**Recommend query-time.** Rationale:

1. A cron would need to re-fire flag detection every hour to be timely — wasteful.
2. Flags are only *consumed* by `/staff-performance` (manager view). Query-time detection means managers always see fresh truth without stale index state.
3. No cron infrastructure currently exists for this (`convex/crons.ts` has 2 unrelated jobs — Phase 70, Phase 79). Adding one increases scope.
4. Query-time cost is cheap: `Date.now() - clockIn > 16h` is a constant-time check per row during `getStaffPerformanceSummary` aggregation.

**Implementation:** add a `flagEngine.ts` pure function called per attendance row during aggregation:

```typescript
export const OPEN_SHIFT_THRESHOLD_MS = 16 * 60 * 60 * 1000;  // staffAttendance/constants.ts

export function detectFlags(
  record: StaffAttendance,
  allSessionsForUser: StaffAttendance[],
  hireDate: number | undefined,
  now: number,
): string[] {
  const flags: string[] = [];
  if (record.clockOut === undefined) {
    if (now - record.clockIn > OPEN_SHIFT_THRESHOLD_MS) flags.push("over_16h");
    // "missing_clockout" = open shift AND it's no longer "today" (user moved on)
    const wibDate = utcToWibDateStr(now);
    if (record.date < wibDate) flags.push("missing_clockout");
  }
  if (hireDate !== undefined && record.clockIn < hireDate) flags.push("before_hire");
  // Overlap flag is user-wide — caller adds if detectOverlaps() includes this record
  return flags;
}
```

### Q16: Correction dialog UX — which fields, required note

Reference `ShiftEditDialog` structure (`src/components/kitchen/ShiftEditDialog.tsx`):
- **Step 1 (input):** Editable fields. Form pre-populated with current record values.
- **Step 2 (review):** Shows before/after deltas for confirmation. Required `editNote` input.
- **Step 3 (submit):** Calls mutation, shows toast.

For `AttendanceCorrectionDialog`, editable fields per D-16:
- **Action selector** (radio or segmented): `edit_timestamps` (default) | `add_missed` | `reassign` | `delete`
- **User selector** (only for `reassign` and `add_missed`): dropdown of active users
- **Date** (YYYY-MM-DD, only for `add_missed`)
- **Clock-in timestamp** (datetime-local, WIB display)
- **Clock-out timestamp** (datetime-local, optional — leave blank to keep open)
- **Correction note** (textarea, `required`, minLength 1, blocks submit if empty — mirrors `ShiftEditDialog` line 756-765 pattern but stricter per D-19)

Confirm dialog (step 2) shows the before-state (from record snapshot) and after-state side-by-side.

**D-19 enforcement:** backend throws `ConvexError` on empty `correctionNote`, AND frontend disables Submit button with `disabled={note.trim().length === 0}`. Belt-and-suspenders — both matter (network malicious clients bypass frontend).

## UI Structure

### Q17: Gate-screen "one-tap button" precedent

No existing "gate screen" pattern in the codebase. Closest precedents for visual style:

- `StatCard` (`src/components/kitchen/StatCard.tsx`) — card primitive with label/value/urgency used in `DashboardHeader`.
- `ShiftSuccessScreen` — used post-submit in `EndOfShiftForm` (referenced line 386). Simple confirmation layout.
- `Login.tsx:72-80` — centered gradient layout with ChefHat icon, suitable style baseline.

**Recommended styling primitives for the giant tap button:**

```tsx
<Button
  size="lg"
  className="h-32 w-full text-2xl font-bold"  // 128px tall, full-width, large text
  onClick={handleClockIn}
  disabled={isClockingIn || hasPriorOpenShift}
>
  <Clock className="mr-3 h-8 w-8" />
  Clock In
</Button>
```

Use `<Card>` (`src/components/ui/card.tsx`) for the last-shift recap section. Icon library: Lucide (`Clock`, `AlertTriangle`, `ChefHat` already imported elsewhere). Colors: `primary` for clock-in button, `destructive` for clock-out.

### Q18: Expandable-row + nested table primitives

Already solved in `src/pages/StaffPerformance.tsx:66-195` — `StaffDetailRow` uses `useState(false)` + `<tr colSpan={N}>` pattern for in-table expansion. No accordion primitive needed.

**Verified shadcn primitives available** in `src/components/ui/`:
- `accordion.tsx` [VERIFIED]
- `collapsible.tsx` [VERIFIED]
- `dialog.tsx` [VERIFIED]
- `table.tsx` [VERIFIED]

For D-14 per-shift breakdown, extend the existing expansion to render a second nested `<Table>` with dynamic columns from `componentTracking` (or fallback). Column headers include unit in parentheses per D-14 spec: `"Big Ball (pcs)"`, `"Outer-Marshmallow (g)"`.

### Q19: CSV export extension

**Recommendation: extend `src/lib/staffPerformanceExport.ts`, don't create a new file.**

Add to `generateStaffPerformanceCSV` (line 23) header row between "Days Worked" and "Product Breakdown":
- `"Hours Worked"` (decimal, e.g. `145.3`)
- `"Days Attended"` (integer — distinct days with a clock-in, may differ from production-based `daysWorked`)
- `"Flagged Shifts"` (integer)

Add to `generateDetailedStaffCSV` (line 109) new row-type: `"Attendance"` with columns `Item=date`, `Quantity=hours`, `Unit="hours"`.

Existing consumers: only `StaffPerformance.tsx:247, 253` use these two functions. Additive columns won't break either call. Name remains `staff-performance-{period}.csv`.

## Dependencies & Risk

### Q20: DA-04 employee profile state

**VERIFIED by schema inspection:**
- `users.hireDate`, `baseSalaryIdr`, `bankAccountHolderName` all present as `v.optional(v.number())`/`v.optional(v.string())` (`convex/schema.ts:469-471`).
- `listUsers` query returns these fields (`convex/auth/queries.ts:55-57`).
- `updateUser`-style mutation accepts them (`convex/auth/mutations.ts:204`).

DA-04 is marked Complete in `.planning/REQUIREMENTS.md:16`. STATE.md confirms Phase 70 shipped.

**Null risk:** Legacy users who existed before DA-04 have `hireDate: undefined`. Per the rule in "Schema Architecture Design / hireDate interaction", the flag engine skips `before_hire` detection in that case — no false positives.

### Q21: Cron integration point

`convex/crons.ts` currently registers 2 crons — `syncInternalOrders` and `bigseller nightly 7d resync`. **No daily WIB-midnight cron exists.**

Since flag detection is query-time (Q15 recommendation), **no cron is needed for Phase 74.** Skip.

If the planner later decides to pre-compute flags on a cron (not recommended), integration looks like:

```typescript
// convex/crons.ts addition (NOT recommended)
crons.daily(
  "attendance flag scan",
  { hourUTC: 17, minuteUTC: 0 },  // 00:00 WIB next day (WIB = UTC+7, 24-7=17)
  internal.staffAttendance.flagEngine.scanAndTag,
);
```

### Q22: Other Convex-specific gotchas for this phase

1. **Index range bound discipline (CLAUDE.md Critical Lesson):** both bounds must be inside `withIndex()`. The `by_user_open` index on `["userId","clockOut"]` with `q.eq("userId", uid).eq("clockOut", undefined)` is fine — both bounds are `eq`, inside the index predicate. Don't drift to `.filter(q => q.eq("clockOut", undefined))` — that's a full-table scan.

2. **`_creationTime` vs business time:** `staffAttendance._creationTime` is the insert-time. Use `clockIn` for business queries. The `kitchenShiftRecords` pattern is identical — see `convex/kitchenShiftRecords/queries.ts:261` which uses a dedicated `submittedAt` field.

3. **Large index scans on clock-out joins:** monthly queries will scan up to 31 × N_staff `staffAttendance` rows + all `kitchenShiftRecords` for the range. Both tables are small (daily insert rate ≤ 50). No pagination needed for v1 — manager month view is O(N) where N ≤ ~1500 rows/month.

4. **Convex `undefined` vs `null`:** Convex validators accept `v.optional(X)` which permits the field to be *absent* (`undefined`). Never `null`. Writing `null` where schema expects `v.optional(v.number())` throws a validator error. Use `undefined` or omit the key.

5. **`useProtectedMutation` session expiry UX:** if the token has expired, `useProtectedMutation` throws and toasts "Session expired." The gate screen should handle this gracefully (redirect to login) rather than show a confusing error.

6. **Schema literal fidelity:** the `action` union on `corrections[].action` must exactly match the mutation's `args.action` union. Fidelity is easy to break when copy-pasting — keep both in the same commit.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 + convex-test (`package.json` [VERIFIED]) |
| Config file | `vitest.config.ts` [VERIFIED] |
| Quick run command | `npx vitest run convex/staffAttendance` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ATT-01 | `clockIn` inserts open row; second `clockIn` for same user blocks | unit (convex-test) | `npx vitest run convex/staffAttendance/__tests__/clockIn.test.ts -t "blocks prior-day open shift"` | ❌ Wave 0 |
| ATT-01 | `clockIn` with prior same-day already-clocked-in throws | unit | `npx vitest run convex/staffAttendance/__tests__/clockIn.test.ts -t "prevents double clock-in"` | ❌ Wave 0 |
| ATT-01 | `clockOut` sets clockOut + durationMs | unit | `npx vitest run convex/staffAttendance/__tests__/clockOut.test.ts -t "sets durationMs"` | ❌ Wave 0 |
| ATT-01 | Gate screen one-tap flow (E2E) | manual-only | Playwright smoke — browser action simulation out of scope for v1 | ❌ deferred |
| ATT-02 | `getStaffPerformanceSummary` extends with `totalHoursWorked` | integration | `npx vitest run convex/kitchenShiftRecords/__tests__/summary.test.ts -t "hours from attendance"` | ❌ Wave 0 (extend existing tests, create if missing) |
| ATT-02 | BOM-resolved ball counting preserved when joined with attendance | integration | `npx vitest run convex/kitchenShiftRecords/__tests__/summary.test.ts -t "BOM balls intact"` | ❌ Wave 0 |
| ATT-03 | Monthly view returns correct `hoursWorked` per staff | integration | `npx vitest run convex/kitchenShiftRecords/__tests__/summary.test.ts -t "monthly hours"` | ❌ Wave 0 |
| ATT-04 | `correctAttendance` throws on empty note | unit | `npx vitest run convex/staffAttendance/__tests__/correctAttendance.test.ts -t "requires note"` | ❌ Wave 0 |
| ATT-04 | `correctAttendance` pushes corrections[] with previous state | unit | `npx vitest run convex/staffAttendance/__tests__/correctAttendance.test.ts -t "audit trail"` | ❌ Wave 0 |
| ATT-04 | `correctAttendance action="delete"` soft-deletes without losing history | unit | `npx vitest run convex/staffAttendance/__tests__/correctAttendance.test.ts -t "soft delete"` | ❌ Wave 0 |

**Pure-function tests (no Convex runtime):**

| Behavior | Test |
|----------|------|
| `detectOverlaps` catches true time overlap | `flagEngine.test.ts::"overlapping sessions"` |
| `detectOverlaps` passes clean lunch break (end < next start) | `flagEngine.test.ts::"adjacent sessions ok"` |
| `detectOverlaps` flags open-shift + any subsequent session | `flagEngine.test.ts::"open shift overlaps everything after"` |
| `detectFlags` returns `["over_16h"]` for 17h open shift | `flagEngine.test.ts::"over_16h rule"` |
| `detectFlags` returns `["missing_clockout"]` for yesterday's open | `flagEngine.test.ts::"missing_clockout rule"` |
| `detectFlags` skips before_hire when hireDate undefined (legacy users) | `flagEngine.test.ts::"before_hire skips legacy users"` |
| `detectFlags` fires before_hire when clockIn < hireDate | `flagEngine.test.ts::"before_hire detects violation"` |
| WIB day boundary: clock-in at 23:59 WIB is still "today" | `flagEngine.test.ts::"WIB day boundary"` |

**Edge cases (must have dedicated test cases):**

1. **Clock-in at WIB midnight (UTC 17:00):** Verify `date` uses WIB-adjusted string. Test with `clockIn = wibMidnightToUtc(2026, 3, 15)` → `date === "2026-04-15"`.
2. **Multiple corrections on same record:** Assert `corrections.length === 2` and each entry retains its own `previousClockIn` snapshot.
3. **Chef reassignment preserves history:** `correctAttendance({ action: "reassign", userId: newUser })` — assert `corrections[0].previousUserId === oldUser`.
4. **Multi-session aggregation:** 3 sessions on same day (morning + lunch + afternoon), assert `totalHoursWorked === sum(durationMs) / 3_600_000`.
5. **Open shift excluded from hours:** open session `clockOut === undefined` contributes 0 to `totalHoursWorked` (not its elapsed time — we only count closed sessions per D-03 semantics).
6. **Production aggregation with no attendance:** D-07 case. Assert `getStaffPerformanceSummary` still returns BOM ball counts for a user with shift records but zero attendance rows.

### Sampling Rate
- **Per task commit:** `npx vitest run convex/staffAttendance`
- **Per wave merge:** `npm run test` (full suite)
- **Phase gate:** Full suite green + `npm run build` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `convex/staffAttendance/__tests__/clockIn.test.ts` — REQ-ATT-01
- [ ] `convex/staffAttendance/__tests__/clockOut.test.ts` — REQ-ATT-01
- [ ] `convex/staffAttendance/__tests__/correctAttendance.test.ts` — REQ-ATT-04
- [ ] `convex/staffAttendance/__tests__/flagEngine.test.ts` — pure-function D-18 rules
- [ ] `convex/kitchenShiftRecords/__tests__/summary.test.ts` — REQ-ATT-02, ATT-03 (check if exists; create if missing)
- [ ] `src/components/staffAttendance/__tests__/RunningTimer.test.tsx` — React Testing Library smoke test for timer format

**Framework install:** none — Vitest + convex-test already configured per `package.json` and `vitest.config.ts`.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | PIN + SHA-256+salt session tokens via `requireRole` (`convex/lib/auth.ts:42-69, 128-148`) — unchanged |
| V3 Session Management | yes | Existing 8h session (`SESSION_DURATION_MS`, line 26). No change. |
| V4 Access Control | yes | Role-based: `requireRole(ctx, token, ["manager","admin"])` on `correctAttendance`. Self-only on `clockOut` (unless manager). |
| V5 Input Validation | yes | Convex validators (`v.string()`, `v.id()`, `v.union(literals)`). ConvexError for semantic validation (empty note, prior open shift). |
| V6 Cryptography | partial | No new crypto. Reuse PIN hash pattern. |

### Known Threat Patterns for Convex + React Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Staff clocks out for another user | Tampering | `clockOut` mutation checks `record.userId === user._id` OR `user.role ∈ [manager,admin]` (see Q13 template) |
| Manager fabricates timestamps for payroll fraud | Tampering | Full audit trail in `corrections[]` with `correctedByUserId`, before/after values, timestamp — non-repudiable |
| Empty correction note evades audit | Repudiation | Server-side `correctionNote` validator + ConvexError if trim-empty |
| Open shift left forever to inflate hours | Tampering | Open shifts (clockOut undefined) contribute 0 to `totalHoursWorked` — only closed sessions count |
| Session token leak → impersonation | Info disclosure | Existing 8h session expiry + per-mutation `requireRole`. Unchanged. |
| XSS in chefName / correctionNote | Tampering | React auto-escapes. No `dangerouslySetInnerHTML`. Inputs stored as plain strings. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Worktree `debug-kitchen-dedupe-round2` will not be merged before Phase 74 execution | Q10 | Plans must include fallback adapter — which we recommend regardless, so blast radius is minimal |
| A2 | Client-side `setInterval(_, 60_000)` for the timer is acceptable (minute resolution) | Q7 | D-01 Discretion explicitly allows this, so risk is near-zero |
| A3 | Query-time flag detection is cheap enough at projected volumes (< ~1500 rows/month) | Q15, Q22.3 | If volumes grow 100× this is still O(N) scan — well within Convex limits. No pagination required. |
| A4 | Correction history as array (not separate log table) is acceptable | Q2 | If planner disagrees, swap to log table — the flag engine and mutations are unaffected |
| A5 | Gate-screen routing via `getRoleLandingPage` swap is the least-invasive hook | Q4 | Alternative is a gate-inside-KitchenViewV2 modal, which D-01 explicitly rejects ("routed to KitchenViewV2" implies separate screens) |

## Open Questions

1. **Worktree merge timing for D-14.** Research can't determine when `debug-kitchen-dedupe-round2` merges. Recommendation: build adapter + target fallback shape. If worktree merges first, the adapter becomes a no-op. Either way, plans execute.
2. **Should "My Performance" be a tab on `/staff-performance` or a separate `/my-performance` route?** Leaning separate (Q12b). Defer to discuss-phase or a design-ready moment in planning.
3. **Should deletion be hard-delete or soft-delete?** The proposed schema uses soft-delete (`deletedAt`). Pro: audit trail survives. Con: every query must filter `deletedAt === undefined`. Recommend soft-delete; plans should add the filter everywhere.

## Sources

### Primary (HIGH confidence)
- `convex/schema.ts:449-485` [VERIFIED] — users + sessions tables
- `convex/schema.ts:1347-1368` [VERIFIED] — kitchenConfig main tree (no componentTracking)
- `convex/schema.ts:1395-1444` [VERIFIED] — kitchenShiftRecords existing shape
- `convex/kitchenShiftRecords/queries.ts:330-557` [VERIFIED] — getStaffPerformanceSummary current implementation
- `convex/kitchenShiftRecords/mutations.ts:73-81, 308-352` [VERIFIED] — requireRole + audit trail pattern
- `convex/lib/auth.ts:21, 128-148` [VERIFIED] — UserRole type + requireRole signature
- `src/App.tsx:472-479, 617-625` [VERIFIED] — existing /staff-performance route + RoleBasedRedirect
- `src/pages/StaffPerformance.tsx` [VERIFIED] — full existing page, 358 lines
- `src/hooks/convex/useStaffPerformance.ts` [VERIFIED] — hook exported today
- `src/lib/staffPerformanceExport.ts` [VERIFIED] — CSV export already handling both summary + detailed formats
- `src/components/kitchen/ShiftEditDialog.tsx` [VERIFIED] — 779-line reference pattern for correction dialog
- `src/components/kitchen/EndOfShiftForm.tsx:72, 117, 347` [VERIFIED] — step machine, success hook point
- `src/contexts/AuthContext.tsx` [VERIFIED] — token flow
- `src/hooks/convex/useProtectedMutation.ts` [VERIFIED] — token auto-injection
- `src/lib/dateUtils.ts` [VERIFIED] — 6 WIB helpers
- `src/lib/types.ts:710, 733, 779, 802, 838-846` [VERIFIED] — canAccessDashboard + getRoleLandingPage
- `convex/auth/queries.ts:38-60` [VERIFIED] — listUsers returns hireDate
- `.claude/worktrees/debug-kitchen-dedupe-round2/convex/schema.ts:1379-1383` [VERIFIED] — worktree componentTracking shape
- `.claude/worktrees/debug-kitchen-dedupe-round2/src/components/kitchen/EndOfShiftForm.tsx` [VERIFIED] — unitByCode consumption pattern
- `package.json` [VERIFIED] — Vitest 4.0.18 + convex-test available
- `vitest.config.ts` [VERIFIED] — test config includes convex/**/*.test.ts
- `.planning/phases/74-staff-attendance/74-CONTEXT.md` [VERIFIED] — D-01..D-19
- `.planning/REQUIREMENTS.md` [VERIFIED] — ATT-01..ATT-04 scope
- `CLAUDE.md` [VERIFIED] — Critical Convex Lessons, Business Rules #10/#13

### Secondary (MEDIUM confidence)
- None — this is entirely codebase research. No external docs were needed.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified in `package.json`
- Architecture: HIGH — patterns extracted directly from existing Phase 21/69 code
- Pitfalls: HIGH — cross-referenced against CLAUDE.md's own Critical Convex Lessons
- Security: HIGH — all controls already in place via `requireRole`
- Validation: HIGH — test framework and patterns already established
- **Worktree dependency (D-14): MEDIUM** — verified worktree exists and contains `componentTracking`; flagged as risk because merge timing is external to research

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (30 days — stable domain, only risk is worktree merge shifting the implementation shape)

## RESEARCH COMPLETE

**One-line summary per major section:**

- **Schema:** new `staffAttendance` table with `userId + date + clockIn + clockOut + durationMs + corrections[] + deletedAt`, 3 indexes (`by_user_date`, `by_user_open`, `by_date`). No FK to `kitchenShiftRecords`.
- **Clock-in/out flow:** new `ClockInGate` at `/kitchen/clock`, routed to from `getRoleLandingPage("kitchen")`; `DashboardHeader` gains `RunningTimer` + `ClockOutButton`; client-side minute-tick setInterval for live timer.
- **Mutations:** `clockIn` (all roles, self-scoped), `clockOut` (all roles, self-only unless manager), `correctAttendance` (manager/admin only, required note, full audit array). All follow existing `requireRole` + `useProtectedMutation` pattern.
- **Join with production:** extend `getStaffPerformanceSummary` additively with `totalHoursWorked`, `daysAttended`, `flaggedShiftCount`, `perDayBreakdown`. Range-scan `staffAttendance` by date, bucket by user, merge into existing staffMap.
- **Flags (D-18):** pure functions in `flagEngine.ts`; query-time detection (no cron); 4 rules — missing_clockout, over_16h, overlapping, before_hire (skip when hireDate undefined for legacy users).
- **Correction UI:** modeled on `ShiftEditDialog` — input → review → confirm; required note enforced both frontend and backend.
- **UI extensions:** `StaffPerformance` page gains hours column + flagged-shift banner + per-day expandable breakdown with dynamic columns. CSV export adds hours/days/flags columns additively.
- **Auth:** `canAccessDashboard` for `/staff-performance`; new `/my-performance` route for staff viewing own data (separate query, different role set).
- **Tests:** 5 new test files in `convex/staffAttendance/__tests__/` + extension to `kitchenShiftRecords` tests. All pure-function rules are unit-testable; mutations use convex-test.
- **Worktree risk:** `componentTracking` field depends on unmerged worktree; plans must include adapter that falls back to legacy `enabledProductionComponents`/`enabledKitchenComponents` + infer units from componentTypes.

Research complete. Planner can now create PLAN.md files targeting ~4 plans (backend+schema, gate-screen+header, correction-dialog+staff-performance-extension, tests).
