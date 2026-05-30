---
phase: 73
plan: 05
subsystem: bank-reconciliation
tags: [ui, revenue-gap, drill-down, wave-2b]
requirements: [BANK-04]
dependency_graph:
  requires:
    - 73-02 (revenueGapByPeriod query)
    - 73-03 (BankLinesPane, SplitViewWorkspace, useRevenueGap hook facade)
  provides:
    - Revenue Gap dashboard tab (D-13/D-14)
    - Cross-tab drill-down filter (D-15)
  affects:
    - src/pages/BankReconciliationPage.tsx (wired real tab content)
    - src/components/bankReconciliation/BankLinesPane.tsx (filter chips)
    - src/components/bankReconciliation/SplitViewWorkspace.tsx (filter banner)
tech-stack:
  added: []
  patterns:
    - URL-as-single-source-of-truth for cross-tab filter state
    - Client-side filtering on existing listLines result (no backend delta)
    - WIB month bounds computed from dateUtils.wibMidnightToUtc
key-files:
  created:
    - src/components/bankReconciliation/RevenueGapTab.tsx
  modified:
    - src/pages/BankReconciliationPage.tsx
    - src/components/bankReconciliation/BankLinesPane.tsx
    - src/components/bankReconciliation/SplitViewWorkspace.tsx
decisions:
  - Client-side drill-down filter: listLines already returns whole-statement result set, so adding backend filter args would be pure duplication. Filter runs in BankLinesPane's existing useMemo.
  - Infinity case detection on the frontend: row qualifies when `!unmappedNote && !isUnallocated && extRev === null && bankCr > 0`. Matches backend's `extRev === 0 ? null : extRev` output.
  - Custom range hard-capped at 12 months (T-73-29 mitigation). Longer spans toast an error.
metrics:
  duration: ~20 min
  completed: 2026-04-15
---

# Phase 73 Plan 05: Revenue Gap Tab + Drill-Down Filter Summary

Ships the Revenue Gap dashboard tab (D-13/D-14) and the Revenue Gap → Review cross-tab drill-down (D-15) with zero backend changes.

## What Shipped

### Task 1 — `RevenueGapTab.tsx` (new) + `BankReconciliationPage.tsx` wire-up
**Commit:** `8734cf5e`

- Period picker: shadcn `<Popover>` with last-12 WIB months list + "Custom…" secondary view. Current month is default, URL `?period=YYYY-MM` pre-selects.
- Custom range: two date inputs validated via `strictWibDateStrToUtcMs`; end date extended to end-of-day; range capped at 12 months.
- Table renders `{ rows, unmappedRows }` from `revenueGapByPeriod`:
  - **Mapped rows** (top): channel, bank credits, ext revenue (or "—"), diff, diff%. Colored dot per-channel via `getPlatformPalette`.
  - **`(unallocated)` row**: italic label + "Needs channel mapping" badge, extRev `—`.
  - **Infinity case** (mapped channel with extRev=null, bankCr>0): diff% renders `—` + `<AlertTriangle>` tooltip "No external revenue recorded — bank shows money we haven't captured."
  - **Unmapped channels group**: collapsible section at bottom (shown by default), each row labeled with "Unmapped" outline badge and diff% always `—`.
- Row click navigates to `/bank-reconciliation?tab=review&channelFilter={channel}&period={YYYY-MM}` (custom ranges omit `period`).
- Keyboard-accessible rows (`role=button`, Enter/Space triggers).
- `BankReconciliationPage` now imports and renders `<RevenueGapTab />` (replaces Plan 03 placeholder card).

### Task 2 — `BankLinesPane` drill-down + `SplitViewWorkspace` banner
**Commit:** `761eef8e`

- `BankLinesPane`:
  - Reads `useSearchParams` for `channelFilter` + `period`.
  - Parses `YYYY-MM` → WIB month bounds (`Date.UTC(year, month, 1, -7, …)` mirroring the dateUtils pattern).
  - Filters lines client-side: only credits where `linkedChannel === channelFilter` AND `date ∈ [start, end]`.
  - Active filter chip (`Filtered by: gopay · 2025-11 [×]`) inside the pane header; × clears both URL params.
  - Empty state copy is drill-down-aware ("No {channel} lines in {period} in this statement.").
- `SplitViewWorkspace`:
  - Top-of-pane callout banner when drill-down is active, with "Clear filter" button.
  - Also shown in the no-statement-selected branch so the user understands the filter will apply after picking a statement.

## Verification

- `npm run type-check` — passes cleanly.
- `npm run build` — passes (no errors, vendor bundle within cap).
- Grep acceptance criteria:
  | Criterion | Result |
  |---|---|
  | `useRevenueGap` in RevenueGapTab | 2 |
  | `(unallocated)` in RevenueGapTab | 2 |
  | `channelFilter=` in RevenueGapTab (drill-down nav) | 1 |
  | `AlertTriangle` in RevenueGapTab | 2 |
  | `RevenueGapTab` in BankReconciliationPage | 2 |
  | `channelFilter` in BankLinesPane | 10 |
  | `useSearchParams` in BankLinesPane | 2 |
  | `Filtered by\|Clear filter\|channelFilter` in SplitViewWorkspace | 8 |

## Deviations from Plan

**None.** Plan executed as specified.

Plan suggested either extending `listLines` with `linkedChannel` + `dateStart`/`dateEnd` args OR client-side filtering. Chose **client-side** because:
1. Backend `listLines` already returns the complete statement-scoped result set — adding server-side filter would not reduce network payload (same `.collect()` query) and would duplicate logic already available client-side.
2. Fewer LOC (backend stays untouched).
3. Faster interaction when user toggles the drill-down chip on/off (no query re-fetch).

This is consistent with the plan's own "Choose server-side if it's <20 LOC; else client-side" guidance — a server-side filter would have required updating query args, the `useBankStatementLines` hook signature, and its callers, exceeding 20 LOC.

## Threat Model Execution

- **T-73-27 (Tampering — malicious channelFilter string)**: Accepted. Filter passes the raw string to a case-sensitive `===` check against `linkedChannel`. Worst case: zero results.
- **T-73-28 (Info Disclosure)**: Accepted. Backend gates `manager|admin`.
- **T-73-29 (Tampering — oversized custom range)**: Mitigated. Frontend caps custom range at 366 days before calling `useRevenueGap`; toasts error otherwise.

## Known Stubs

None.

## Files

**Created:**
- `src/components/bankReconciliation/RevenueGapTab.tsx`

**Modified:**
- `src/pages/BankReconciliationPage.tsx`
- `src/components/bankReconciliation/BankLinesPane.tsx`
- `src/components/bankReconciliation/SplitViewWorkspace.tsx`

**Commits:**
- `8734cf5e` feat(73-05): Revenue Gap dashboard tab with drill-down navigation
- `761eef8e` feat(73-05): BankLinesPane drill-down filter via channelFilter + period URL params

## Self-Check: PASSED

- FOUND: src/components/bankReconciliation/RevenueGapTab.tsx
- FOUND: commit 8734cf5e (feat 73-05 RevenueGapTab)
- FOUND: commit 761eef8e (feat 73-05 drill-down filter)
- Type-check + build green. All grep acceptance criteria satisfied.
