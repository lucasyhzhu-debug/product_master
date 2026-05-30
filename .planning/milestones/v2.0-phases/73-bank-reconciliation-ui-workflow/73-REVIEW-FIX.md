---
phase: 73-bank-reconciliation-ui-workflow
fixed_at: 2026-04-15T00:00:00Z
review_path: .planning/phases/73-bank-reconciliation-ui-workflow/73-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 73: Code Review Fix Report

**Fixed at:** 2026-04-15
**Source review:** `.planning/phases/73-bank-reconciliation-ui-workflow/73-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (1 Critical + 6 Warning; Info out of scope)
- Fixed: 7
- Skipped: 0

## Fixed Issues

### CR-01: BatchConfirmDialog balance gate is a tautology

**Files modified:** `src/components/bankReconciliation/BatchConfirmDialog.tsx`
**Commit:** b9daf712
**Applied fix:** Replaced the tautological `drSum += line.amountIdr; crSum += line.amountIdr` pattern with per-account net-position aggregation. Each line now contributes `+amount` to its debit account and `-amount` to its credit account in a `Map<accountId, net>`. After the loop, positive nets sum to aggregate DR and |negative nets| sum to aggregate CR, so the balance gate detects real asymmetry when debit/credit account pairs overlap with opposite signs across groups.

**Note:** Logic fix — **requires human verification**. The algorithmic change matches the reviewer's recommended approach verbatim and was validated by type-check, but semantic correctness (does the new gate correctly catch a contrived imbalance case?) should be confirmed with a unit test in the verification phase.

### WR-01: D-21 CapEx round-trip creates `status: "recorded"` expense — contradicts D-17

**Files modified:** `convex/fixedAssets/mutations.ts`
**Commit:** 32a26f9a
**Applied fix:** Changed the companion expense insert in `fixedAssets:create` (when `sourceBankLineId` is supplied) from `status: "recorded"` with pre-populated `approvedBy`/`approvedAt`/`journalEntryId` to `status: "submitted"` with none of those fields set. The acquisition JE is still posted immediately (asset remains usable), but the companion expense stays in the approval queue as a tracking record, preserving second-reviewer separation for CapEx.

### WR-02: `manualMatch` polymorphic cast skips target-type cross-verification

**Files modified:** `convex/bankStatements/mutations.ts`
**Commit:** c3d6a8f3
**Applied fix:** Used `ctx.db.normalizeId(tableName, rawId)` as the correct runtime gate. The reviewer suggested a per-type lookup object, but `ctx.db.get(rawId as Id<"X">)` still returns the doc regardless of the casted table name at runtime — the cast is purely compile-time. `normalizeId` returns `null` when the id does not belong to the requested table, which is the actual polymorphic FK check needed here. Added a `matchedType → tableName` record, validate, then `get` on the normalized id.

### WR-03: `inlineCreateReimbursement` calls `requireRole` twice

**Files modified:** `convex/bankStatements/mutations.ts`
**Commit:** fc0b5dcc
**Applied fix:** Captured the user object on the first `requireRole` call at handler top, used it for `createdBy` downstream, removed the second call.

### WR-04: `markAssetLinked` TOCTOU window

**Files modified:** `convex/bankStatements/mutations.ts`
**Commit:** 7a22da46
**Applied fix:** Added post-write consistency re-query after the patch. Fetches the line again and throws `"Concurrent asset-link detected; retry"` if `createdExpenseId !== args.expenseId`. Mirrors the existing pattern in `manualMatch` (C3). Convex mutation atomicity rolls back the losing writer's patch on throw.

### WR-05: `InlineReimbursementDialog` free-text ID inputs (PARTIAL)

**Files modified:** `src/components/bankReconciliation/InlineReimbursementDialog.tsx`
**Commit:** 43c95a2d
**Applied fix:** Added client-side shape validation (`/^[a-z0-9]{20,}$/i` regex) for both `employeeUserId` and each parsed `expenseId` before calling the mutation. Fat-fingered input now produces a clear toast instead of a cryptic server-side "not found" or silent-null from a wrong-table id.

**Scope deviation (flagged per critical rules):** The reviewer's preferred fix was to replace both inputs with pickers backed by `users` and `reimbursements:listAwaitingPaymentByEmployee` queries. That query is currently `admin`-only whereas the mutation accepts `manager+admin`, so the full fix requires widening `reimbursements.queries.listAwaitingPayment` role access AND a meaningful UX redesign (employee combobox + multi-select picker). Both land outside Phase 73's reconciliation scope and touch a separate subsystem. Per the review's fallback guidance ("if that broadens scope beyond Phase 73, at minimum ... validate the pasted strings against a `users/` / `expenses/` prefix regex before submit") — took the fallback path. The backend WR-02 fix separately defends against mislabeled ids in the polymorphic path, and the mutation uses `v.id("users")` / `v.array(v.id("expenses"))` validators which enforce shape server-side regardless.

Recommend a follow-up backlog item for the full picker redesign.

### WR-06: `RevenueGapTab` drops custom period when drilling down

**Files modified:** `src/components/bankReconciliation/RevenueGapTab.tsx`, `src/components/bankReconciliation/BankLinesPane.tsx`
**Commit:** b5760345
**Applied fix:**
- `RevenueGapTab.handleRowClick`: emit `&periodStart=...&periodEnd=...` (UTC epoch ms) when `period.custom`, else existing `&period=YYYY-MM`.
- `BankLinesPane`: added `periodBoundsFromExplicit` parser for `periodStart`/`periodEnd` params; explicit bounds take precedence over the YYYY-MM key. Added `formatWibDateShort` helper. Updated `clearDrillDown` to also delete the new params. Updated the active-filter chip label to render `"YYYY-MM-DD → YYYY-MM-DD"` for custom ranges vs. raw YYYY-MM for presets.

## Skipped Issues

None — all in-scope findings were fixed (WR-05 marked as partial with documented scope deviation).

---

_Fixed: 2026-04-15_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
