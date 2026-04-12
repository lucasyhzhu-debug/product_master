# Staff Review: Quick 260411-ovn — Editable Paid Date for Consignment Settlements

**Date:** 2026-04-11
**Reviewer:** Staff Review (Senior Engineer perspective)
**Branch:** `quick/260411-ovn-editable-paid-date`
**Files Changed:** `convex/consignment/mutations.ts`, `src/components/salesAnalytics/SettlementTimeline.tsx`, `src/components/salesAnalytics/OutletCard.tsx`

---

## Overall Assessment

**APPROVE** — Clean, minimal implementation that matches the plan with high fidelity. The diff is tight (3 files, ~30 lines added) and does exactly what was specified. Two minor improvements noted below; no critical or blocking issues.

---

## Plan Fidelity

The implementation matches the plan precisely:

| Plan Requirement | Implementation | Status |
|------------------|---------------|--------|
| `paidAt: v.optional(v.number())` in mutation args | Line 304 of mutations.ts | Done |
| `const paidAt = args.paidAt ?? now;` with `updatedAt` always `Date.now()` | Lines 309-310, patched with `paidAt` (user-chosen) and `updatedAt: now` (always current) | Done |
| `onMarkPaid` signature changed to `(settlement, paidAt: number)` | SettlementTimeline.tsx line 23 | Done |
| Date picker via `<Input type="date">` as ConfirmDialog child | SettlementTimeline.tsx lines 164-174 | Done |
| `setPaidDate(fromEpochToDateString(Date.now()))` on button click | SettlementTimeline.tsx lines 127-128 | Done |
| `max` attribute to block future dates | SettlementTimeline.tsx line 170 | Done |
| `toLocalEpoch(paidDate)` passed through `onMarkPaid` | SettlementTimeline.tsx line 160 | Done |
| `handleMarkPaid` accepts `paidAt` and passes to mutation | OutletCard.tsx lines 67-69 | Done |

**No scope creep.** No planned items are missing. The diff is a 1:1 match of the plan tasks.

---

## Critical Issues

None.

---

## Improvements (Recommended)

### I-01: No backend validation against future `paidAt` timestamps

**Severity:** Low (admin-only tool), but worth noting.

The plan's threat model (T-ovn-01) explicitly accepts this risk, noting the frontend `max` attribute blocks future dates and the mutation is admin/manager-gated. This is a reasonable disposition for an internal tool. However, the `max` attribute is computed once on render and is trivially bypassed via DevTools or direct API call.

If future-date paid dates would corrupt downstream reporting (e.g., income statement period buckets), add a one-line server guard:

```typescript
if (paidAt > now + 60_000) throw new Error("paidAt cannot be in the future");
```

The 60s buffer accounts for clock skew. This is optional for the current admin-only context.

### I-02: `max` attribute uses `Date.now()` at render time, not reactively

**Severity:** Nitpick.

```tsx
max={fromEpochToDateString(Date.now())}
```

If the dialog stays open past midnight (unlikely but possible), the `max` constraint will be stale. This is a non-issue in practice since the dialog is short-lived and the backend would still accept today's date regardless. Noting for completeness only.

---

## Refinements (Optional Polish)

### R-01: Empty `paidDate` string if user clears the date input

If the user clears the date input and clicks "Mark as Paid", `toLocalEpoch("")` would produce `NaN` (since `new Date("T00:00:00").getTime()` is `NaN`), which would be stored as `paidAt: NaN`. This is extremely unlikely given the dialog flow (user would have to manually clear the native date picker), but a defensive guard in `onConfirm` would be prudent:

```tsx
onConfirm={() => {
  const ts = toLocalEpoch(paidDate);
  if (isNaN(ts)) return; // guard against cleared input
  onMarkPaid(targetPaid, ts);
  setConfirmPaidId(null);
}}
```

Alternatively, disable the confirm button when `paidDate` is empty.

### R-02: Date picker could show the settlement period end as a hint

Not in the plan, but a UX refinement for a future iteration: defaulting `paidDate` to the settlement's `periodEnd` (or at least showing it as a hint) would save the user from having to recall when payment was actually made. Not a gap — just a natural next step.

---

## Architecture Assessment

**Date handling approach is correct.** The `toLocalEpoch` / `fromEpochToDateString` utilities in `settlementUtils.ts` properly handle WIB timezone by constructing dates with `"T00:00:00"` suffix (local midnight) instead of using `Date.parse()` which interprets YYYY-MM-DD as UTC. This matches the project's established pattern documented in `settlementUtils.ts` comments and avoids the off-by-one-day bug in WIB (UTC+7).

**Client-supplied `paidAt` is appropriate for this use case.** This is an admin tool for recording retroactive payment dates. The mutation is already gated by `requireRole(ctx, args.token, ["admin", "manager"])`. The `v.optional(v.number())` Convex validator ensures type safety. The fallback to `Date.now()` preserves backward compatibility for any callers that don't pass `paidAt`.

**`updatedAt` vs `paidAt` separation is correct.** The plan correctly identified that `updatedAt` should remain `Date.now()` (actual mutation time for audit trail) while `paidAt` uses the user-supplied value. The implementation follows this exactly.

**ConfirmDialog `children` prop usage is clean.** The existing `ConfirmDialog` component already supports a `children` prop (rendered between the description and footer). This avoids creating a new dialog component or adding feature-specific props to a shared component.

---

## Test Coverage

No tests exist for consignment mutations or the settlement UI components. This is consistent with the project's current test coverage pattern for this module (no pre-existing tests). The plan did not include tests, and given the small scope this is acceptable, but the `toLocalEpoch("")` edge case (R-01) is the kind of thing a unit test would catch.

---

## Summary

| Category | Count | Details |
|----------|-------|---------|
| Critical | 0 | — |
| Improvements | 2 | I-01: No backend future-date guard (accepted risk), I-02: Stale `max` (non-issue) |
| Refinements | 2 | R-01: NaN guard on empty date, R-02: Default to period end (future UX) |

**Verdict:** Ship it. The implementation is plan-faithful, minimal, and architecturally sound. R-01 (NaN guard) is the only item worth addressing before merge — a one-line fix.
