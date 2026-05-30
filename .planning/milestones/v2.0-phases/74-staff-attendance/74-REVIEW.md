---
phase: 74-staff-attendance
reviewed: 2026-04-16T00:00:00Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - convex/kitchenShiftRecords/__tests__/summary.test.ts
  - convex/kitchenShiftRecords/queries.ts
  - convex/schema.ts
  - convex/staffAttendance/__tests__/clockIn.test.ts
  - convex/staffAttendance/__tests__/clockOut.test.ts
  - convex/staffAttendance/__tests__/correctAttendance.test.ts
  - convex/staffAttendance/__tests__/flagEngine.test.ts
  - convex/staffAttendance/__tests__/helpers.ts
  - convex/staffAttendance/aggregation.ts
  - convex/staffAttendance/constants.ts
  - convex/staffAttendance/flagEngine.ts
  - convex/staffAttendance/mutations.ts
  - convex/staffAttendance/queries.ts
  - src/App.tsx
  - src/components/kitchen/EndOfShiftForm.tsx
  - src/components/layout/Header.tsx
  - src/components/staffAttendance/AttendanceCorrectionDialog.tsx
  - src/components/staffAttendance/AttendanceStrip.tsx
  - src/components/staffAttendance/ClockOutButton.tsx
  - src/components/staffAttendance/ClockOutNudgeDialog.tsx
  - src/components/staffAttendance/FlaggedShiftsBanner.tsx
  - src/components/staffAttendance/PerDayBreakdownTable.tsx
  - src/components/staffAttendance/RunningTimer.tsx
  - src/components/staffAttendance/__tests__/RunningTimer.test.tsx
  - src/components/staffAttendance/index.ts
  - src/hooks/convex/index.ts
  - src/hooks/convex/useAttendance.ts
  - src/lib/staffPerformanceExport.ts
  - src/lib/types.ts
  - src/pages/ClockInGate.tsx
  - src/pages/KitchenViewV2.tsx
  - src/pages/MyPerformance.tsx
  - src/pages/StaffPerformance.tsx
  - tests/e2e/staff-attendance.spec.ts
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 74: Code Review Report

**Reviewed:** 2026-04-16
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Summary

Phase 74 delivers the Staff Attendance system — clock-in/clock-out mutations with a session-derived userId (T-74-01), a pure-function flag engine (missing_clockout, over_16h, overlapping, before_hire), manager correction mutations with a non-repudiable corrections[] audit trail (T-74-02), and a hard-scoped MyPerformance query (T-74-03). Backend and frontend both demonstrate good defensive posture: owner-or-manager gates on clock-out, D-04 server enforcement for prior-day self-closure, trimmed-note validation, synthetic-Doc-as-seed pattern for the correction dialog, and BOM-resolved ball counting throughout.

The code is generally well-structured with strong tests covering role gating, soft-delete handling, D-18 flag rules, and the D-11 no-cross-unit subtotal rule. However, the review surfaces one correctness bug in the overlap detector that can miss true overlaps in ≥3-session scenarios, plus several defensive-hardening opportunities and auth-boundary inconsistencies worth addressing before merge.

## Critical Issues

_(none)_

## Warnings

### WR-01: `detectOverlaps` misses transitive overlaps across 3+ sessions

**File:** `convex/staffAttendance/flagEngine.ts:39-54`
**Issue:** The algorithm only compares each session against its immediate predecessor after sort-by-clockIn. This misses true overlaps when a long-running session spans multiple later shorter sessions.

Example: three closed sessions for one user
- A: 08:00–18:00 (10h)
- B: 09:00–10:00 (1h, inside A)
- C: 11:00–12:00 (1h, also inside A)

After sort: A, B, C.
- i=1: prev=A (end 18:00), cur=B (start 09:00) → 18 > 9 → A, B flagged ✓
- i=2: prev=B (end 10:00), cur=C (start 11:00) → 10 > 11 false → no flag ✗

C overlaps A but is never flagged. Same issue for 3 open shifts where the middle one is "inside" the first. The Plan 04 `summary.test.ts` test at line 387–401 uses only two overlapping sessions so the bug is not caught.

**Fix:**
```typescript
export function detectOverlaps(
  sessions: Array<Doc<"staffAttendance">>,
): Set<Id<"staffAttendance">> {
  const flagged = new Set<Id<"staffAttendance">>();
  const sorted = [...sessions].sort((a, b) => a.clockIn - b.clockIn);
  // Track the running max-end so a long earlier session still catches
  // later shorter sessions it envelops.
  let maxEnd = Number.NEGATIVE_INFINITY;
  let maxEndId: Id<"staffAttendance"> | null = null;
  for (const cur of sorted) {
    if (maxEnd > cur.clockIn) {
      flagged.add(cur._id);
      if (maxEndId) flagged.add(maxEndId);
    }
    const curEnd = cur.clockOut ?? Number.POSITIVE_INFINITY;
    if (curEnd > maxEnd) {
      maxEnd = curEnd;
      maxEndId = cur._id;
    }
  }
  return flagged;
}
```
Also add a regression test with the A/B/C fixture above asserting all three IDs appear in the returned set.

---

### WR-02: `toWibDateString` silently produces wrong date for negative epoch inputs

**File:** `convex/staffAttendance/flagEngine.ts:27-29`
**Issue:** `new Date(utcMs + WIB_OFFSET_MS).toISOString().slice(0, 10)` throws `RangeError: Invalid time value` for very old epoch values (e.g. `hireDate` missing/seeded as 0 and then compared against a large offset would still work, but this only breaks at the JS Date limit). More importantly, the function has no defensive guard for `NaN` inputs — if any upstream caller passes NaN (e.g. a malformed `clockIn`), `toISOString()` throws, and the stack frame surfaces inside `toWibDateString` rather than at the bad-input source. The downstream `detectFlags` path is also fragile because it compares `record.date < todayWib` using lexicographic string compare — correct only while both are well-formed `YYYY-MM-DD`.

**Fix:** Add a defensive input check:
```typescript
export function toWibDateString(utcMs: number): string {
  if (!Number.isFinite(utcMs)) {
    throw new Error(`toWibDateString: non-finite input ${utcMs}`);
  }
  return new Date(utcMs + WIB_OFFSET_MS).toISOString().slice(0, 10);
}
```
Low impact since all current call sites pass finite numbers, but the early throw with a named source beats a cryptic `RangeError` later.

---

### WR-03: Client-computed `date` in AttendanceCorrectionDialog can drift from WIB when crossing UTC midnight

**File:** `src/components/staffAttendance/AttendanceCorrectionDialog.tsx:80-87`
**Issue:** `datetimeLocalWibToEpochMs` rebuilds a UTC moment from a WIB-local datetime input. The `date` passed with `add_missed` is the separate `<input type="date">` value (line 336), but if the manager picks a `clockIn` time that falls on the WIB-previous-day (e.g. `00:00` with UTC offset arithmetic) while the date field remains today, the backend writes `date = today` but `clockIn = yesterday-epoch-ms`, causing `detectFlags` to flag `missing_clockout` on the new row because `record.date < todayWib` is false but `clockIn < hireDate` or `clockIn` epoch doesn't match `date`.

The backend has no consistency check that `toWibDateString(clockIn) === date` for add_missed. This mostly surfaces if a manager manually enters a time that crosses WIB midnight relative to the picked date.

**Fix (backend mutation):** In `correctAttendance` under the `add_missed` branch, after computing `durationMs`, assert:
```typescript
if (args.action === "add_missed") {
  // existing validation ...
  const derivedDate = toWibDateString(args.clockIn);
  if (derivedDate !== args.date) {
    throw new ConvexError(
      `Date field (${args.date}) does not match clock-in WIB date (${derivedDate})`,
    );
  }
  // ... existing insert
}
```
Also consider the same guard in `edit_timestamps` when `clockIn` changes across a WIB-date boundary relative to `existing.date`.

---

### WR-04: `getMyLastShiftSummary` N+1 risk on `menuProductComponents.collect()`

**File:** `convex/staffAttendance/queries.ts:84`
**Issue:** The query calls `ctx.db.query("menuProductComponents").collect()` to fetch the entire BOM table on every gate-screen load (every kitchen user hits this on login). As the product catalog grows, this becomes a hot path that scans the whole table even though only the products appearing in the user's same-day shift records are relevant.

**Fix:** Scope the fetch to the menuProductIds actually present in `shifts`:
```typescript
const neededProductIds = new Set<string>();
for (const rec of shifts) {
  for (const item of rec.produced ?? []) neededProductIds.add(String(item.menuProductId));
}
const allMpcs = await Promise.all(
  Array.from(neededProductIds).map((id) =>
    ctx.db
      .query("menuProductComponents")
      .withIndex("by_menu_product", (q) =>
        q.eq("menuProductId", id as Id<"menuProducts">),
      )
      .collect(),
  ),
);
const bomByProduct = new Map<string, Array<{ componentTypeId: Id<"componentTypes">; quantity: number }>>();
for (let i = 0; i < Array.from(neededProductIds).length; i++) {
  bomByProduct.set(
    Array.from(neededProductIds)[i],
    allMpcs[i].map((mpc) => ({
      componentTypeId: mpc.componentTypeId as Id<"componentTypes">,
      quantity: mpc.quantity,
    })),
  );
}
```
If the catalog is small today this is a minor issue, but for a gate-screen query hit on every login it's worth scoping now.

## Info

### IN-01: `listUsers` permission check in AttendanceCorrectionDialog is not gated to manager/admin

**File:** `src/components/staffAttendance/AttendanceCorrectionDialog.tsx:95`
**Issue:** The dialog calls `useQuery(api.auth.queries.listUsers)` unconditionally. If `listUsers` enforces a manager/admin role on the server, the query will fail for kitchen/order_staff — but the dialog should never open for those roles anyway since the Fix button is rendered from `/staff-performance` (canAccessDashboard). Not a security issue (backend gates `correctAttendance`), but the query call still fires on component mount for any role that imports this component. Verify `listUsers` returns `[]` for unauthorized roles rather than throwing.

**Fix:** Confirm `api.auth.queries.listUsers` degrades gracefully or gate the dialog's render via role. Currently benign because the dialog is only rendered behind canAccessDashboard, but if it's ever reused elsewhere this becomes a live risk.

---

### IN-02: Synthetic Doc cast on `StaffPerformance.handleFix` elides `deletedAt`/`corrections` fields

**File:** `src/pages/StaffPerformance.tsx:323-331`
**Issue:** The synthetic Doc is missing `corrections`, `deletedAt`, `deletedBy`. Since the dialog is seed-only and the backend re-loads the real record (T-74-09), this is safe — but TypeScript is silently OK with it because the cast is `as Doc<"staffAttendance">`, bypassing checking. Any future code that reads `attendance.corrections` from the seed (not the backend) would get `undefined` instead of the real history.

**Fix:** Either explicitly type the seed fields or document the caveat more strictly with a comment anchored to the cast site. Prefer building a minimal seed interface rather than casting:
```typescript
interface AttendanceSeed {
  _id: Id<"staffAttendance">;
  userId: Id<"users">;
  date: string;
  clockIn: number;
  clockOut?: number;
}
// And update AttendanceCorrectionDialog's `attendance` prop to accept `Doc<"staffAttendance"> | AttendanceSeed | null`
```

---

### IN-03: `aggregateStaffPerformance` loads full `menuProductComponents` table via `ctx.db.query(...).collect()`

**File:** `convex/staffAttendance/aggregation.ts:201-211`
**Issue:** The aggregation fetches all `menuProductComponents` in parallel per productId, which is correct. However, the earlier `buildTrackingMap` and this function each call `ctx.db.query("componentTypes").collect()` separately — two full-table scans per aggregation. Preferable to pass the `componentTypes` once down to the adapter.

**Fix:** Hoist the `componentTypes` collect out of `buildTrackingMap` and pass it as a parameter, or cache on the module. Minor perf gain; aggregation is already manager-bounded.

---

### IN-04: `useAuth().user?.userId` comparison in KitchenViewV2 against `selectedChefId` may silently mis-compare

**File:** `src/pages/KitchenViewV2.tsx:273`
**Issue:** `user?.userId` is a plain string from `AuthSession` while `selectedChefId` comes from a `<SelectItem value={u._id}>` where `u._id` is a Convex Id (also coerces to string). The equality `selectedChefId === user?.userId` should work because Convex Id.toString() is stable, but the `string` vs `Id` comparison is brittle; a runtime type difference would silently fail the "is-self" check and nudge the wrong user.

**Fix:** Add an explicit String() coercion on both sides for defense-in-depth:
```typescript
const isSelf =
  selectedChefId === "" || String(selectedChefId) === String(user?.userId);
```

---

### IN-05: `RunningTimer` interval not reset on `clockIn` prop change

**File:** `src/components/staffAttendance/RunningTimer.tsx:21-24`
**Issue:** The `useEffect` dependency array is `[]`. If `clockIn` ever changes (e.g. a shift is corrected and the parent re-renders with a new id while leaving the component mounted), the interval keeps ticking but `now - clockIn` is computed against the new prop only on the next tick. This is cosmetic — worst case the user sees a 1-minute stale display — but the interval should still be refreshed when the prop identity changes.

**Fix:**
```typescript
useEffect(() => {
  setNow(Date.now());
  const id = setInterval(() => setNow(Date.now()), 60_000);
  return () => clearInterval(id);
}, [clockIn]);
```

---

_Reviewed: 2026-04-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
