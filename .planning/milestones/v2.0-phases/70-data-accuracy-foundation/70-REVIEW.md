---
phase: 70-data-accuracy-foundation
reviewed: 2026-04-10T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - tests/convex/internalAdapter.test.ts
  - convex/migrations/fixConfirmedOrders.ts
  - convex/integrations/internal/adapter.ts
  - convex/integrations/internal/queries.ts
  - convex/crons.ts
  - src/components/salesAnalytics/SettingsTab.tsx
  - convex/schema.ts (menuProducts.cogsOverrideIdr, users.hireDate/baseSalaryIdr/bankAccountHolderName)
  - convex/lib/costCalculator.ts
  - convex/menuProducts/mutations.ts
  - convex/reports/incomeStatement.ts
  - convex/auth/mutations.ts
  - src/pages/MenuProductsManager.tsx
  - src/pages/UsersManager.tsx
  - tests/convex/costCalculator.test.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 70: Code Review Report

**Reviewed:** 2026-04-10
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 70 introduces three main features: (1) an internal revenue sync pipeline (`syncInternalOrders` action + queries + cron), (2) a flat COGS override field on `menuProducts`, and (3) employee profile fields (`hireDate`, `baseSalaryIdr`, `bankAccountHolderName`) on `users`. The migration `fixConfirmedOrders` backfills orders stuck at the "Confirmed" status. Overall the code is well-structured and follows project patterns. One critical authorization gap was found in `updateUser` — it accepts arbitrary user ID with no auth check — plus four warnings around index alignment, revenueItems duplication, COGS override test coverage, and margin display logic.

## Critical Issues

### CR-01: `updateUser` mutation has no authorization check

**File:** `convex/auth/mutations.ts:188-218`

**Issue:** `updateUser` accepts any `userId` with no token or role check. Any authenticated user who knows (or can guess) another user's ID can overwrite their `name`, `role`, `hireDate`, `baseSalaryIdr`, and `bankAccountHolderName`. Role escalation is directly exploitable: a `kitchen` user could promote themselves to `admin` by passing `role: "admin"`. The newly added Phase 70 employee fields (`baseSalaryIdr`) are sensitive salary data that should require admin authorization.

```typescript
// Current — no auth at all
export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    role: v.optional(v.union(...)),
    // ...
    baseSalaryIdr: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, ...updates } = args;
    // ...
  },
});
```

**Fix:** Add a `token` arg and guard with `requireRole`. Because `updateBankDetails` already provides a self-service path for bank fields, `updateUser` should be admin-only.

```typescript
export const updateUser = mutation({
  args: {
    token: v.string(),
    userId: v.id("users"),
    name: v.optional(v.string()),
    role: v.optional(v.union(...)),
    avatarUrl: v.optional(v.string()),
    hireDate: v.optional(v.number()),
    baseSalaryIdr: v.optional(v.number()),
    bankAccountHolderName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    const { userId, token: _, ...updates } = args;
    // rest unchanged
  },
});
```

The `UsersManager.tsx` call site at line 136 must also pass `token: user.token` once this fix is applied.

---

## Warnings

### WR-01: `saveRevenue` upsert returns existing ID — `revenueItems` still re-written on every re-sync

**File:** `convex/integrations/internal/adapter.ts:108-151`

**Issue:** `saveRevenue` returns all IDs (existing + new), and `insertedIds[j]` is used unconditionally to call `saveRevenueItems`. When an order is re-synced (incremental sync catches it again via the 24-hour buffer), `saveRevenue` returns the *existing* revenue ID, but `saveRevenueItems` is still called and attempts to insert items. `saveRevenueItems` deduplicates by `externalItemId`, so no data is corrupted, but it fires a mutation per batch item on every re-sync pass even when there is nothing to write, creating unnecessary Convex mutation load. More critically, if `insertedIds.length < batch.length` (some were duplicates), the index `insertedIds[j]` is misaligned with `batch[j]` — a skipped duplicate produces no entry in `insertedIds`, causing `revenueId` to be the wrong ID for subsequent items in the same batch.

```typescript
// adapter.ts:113-114
newTransactions += insertedIds.length;
skippedDuplicates += batch.length - insertedIds.length;
// ...
for (let j = 0; j < batch.length; j++) {
  const revenueId = insertedIds[j];   // MISALIGNED when insertedIds.length < batch.length
```

**Fix:** `saveRevenue` should return `{ id, isNew }` pairs (one per input record) to preserve positional alignment:

```typescript
// In saveRevenue handler, always push:
ids.push({ id: existing ? existing._id : newId, isNew: !existing });

// In adapter.ts, use result.id for revenueItems and result.isNew for counting:
const batchResults = insertedIds; // now Array<{id, isNew}>
newTransactions += batchResults.filter(r => r.isNew).length;
skippedDuplicates += batchResults.filter(r => !r.isNew).length;
// ...
for (let j = 0; j < batch.length; j++) {
  const { id: revenueId, isNew } = batchResults[j];
  if (isNew) { /* write items */ }
}
```

---

### WR-02: Cron references public `api` for an `action` — should use `internalAction` pattern

**File:** `convex/crons.ts:9`

```typescript
crons.interval(
  "sync internal orders revenue",
  { hours: 1 },
  api.integrations.internal.adapter.syncInternalOrders,  // public api
  { triggeredBy: "cron" }
);
```

**Issue:** `syncInternalOrders` is registered as a public `action` (not `internalAction`). This means it is also callable externally by anyone with the deployment URL, with no authentication required. The action itself contains no auth check (it's intended as a cron). An external caller can trigger arbitrary full-syncs or inject `triggeredBy` strings.

**Fix:** Convert to `internalAction` and reference it via `internal.*` in crons:

```typescript
// adapter.ts
import { internalAction } from "../../_generated/server";
export const syncInternalOrders = internalAction({ ... });

// crons.ts
import { internal } from "./_generated/api";
crons.interval(
  "sync internal orders revenue",
  { hours: 1 },
  internal.integrations.internal.adapter.syncInternalOrders,
  { triggeredBy: "cron" }
);
```

Note: `useSyncInternalOrders` in `SettingsTab.tsx` calls this via the public `api` — that call site will need to stay as a public action OR be wrapped in a thin public action that delegates to the internal one. Simplest path: keep a thin public wrapper that calls the internal action.

---

### WR-03: `fixConfirmedOrders` migration does not validate `paymentStatus`

**File:** `convex/migrations/fixConfirmedOrders.ts:53-57`

**Issue:** The migration advances any `Confirmed` order that has `finalTotal > 0` to `PaymentReceived`, but the guard does not check `paymentStatus`. An order could be `Confirmed` with a real `finalTotal` but have `paymentStatus: "Unpaid"` or `"Pending"`, meaning payment was never received. Advancing such orders to `PaymentReceived` misrepresents their financial state and inflates revenue analytics.

```typescript
// Current guard — only checks finalTotal
const hasTotal = order.finalTotal != null && order.finalTotal > 0;
```

**Fix:** Also require `paymentStatus === "Paid"` before advancing:

```typescript
const hasTotal = order.finalTotal != null && order.finalTotal > 0;
const isPaid = order.paymentStatus === "Paid" || order.paymentStatus === "PaymentReceived";

if (hasTotal && isPaid) {
  // advance to PaymentReceived
} else {
  results.push({ ..., action: "skipped_not_paid" });
}
```

---

### WR-04: Inline COGS override `onBlur` fires after `Enter` key save — double save risk

**File:** `src/pages/MenuProductsManager.tsx:483`

```tsx
<input
  onBlur={() => handleCogsOverrideSave(product._id as string)}
  onKeyDown={(e) => handleCogsKeyDown(e, product._id as string)}
```

**Issue:** When the user presses `Enter`, `handleCogsKeyDown` calls `handleCogsOverrideSave` and then sets `editingCogsId` to `null` in the `finally` block. However, losing focus (from unmounting the input) also fires `onBlur` immediately after, which calls `handleCogsOverrideSave` a second time. The second call runs with `cogsInputValue` potentially already cleared. With the current `finally: setCogsInputValue('')`, the second call will save an empty string value, triggering `clearCogsOverride: true` — undoing the override that was just saved.

**Fix:** Use a ref flag or check inside the save handler to prevent double invocation:

```typescript
const handleCogsKeyDown = (e: React.KeyboardEvent, productId: string) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    // Prevent the onBlur from firing after this
    e.currentTarget.blur(); // triggers onBlur but we guard in save
  } else if (e.key === 'Escape') {
    setEditingCogsId(null);
    setCogsInputValue('');
  }
};
```

Simpler fix: clear `editingCogsId` before clearing `cogsInputValue` in `handleCogsOverrideSave`, then guard on entry:

```typescript
const handleCogsOverrideSave = async (productId: string) => {
  if (editingCogsId !== productId) return; // already saved/cancelled
  setEditingCogsId(null); // close input immediately before await
  const trimmed = cogsInputValue.trim();
  setCogsInputValue('');
  // ... rest of save logic using captured `trimmed`
};
```

---

## Info

### IN-01: COGS override test suite missing `cogsOverrideIdr: 0` null-check alignment

**File:** `tests/convex/costCalculator.test.ts:143-147`

The `"zero override is valid (free product)"` test passes correctly, confirming `buildProductCOGSMap` treats `0` as a set override. However the `buildProductCOGSMap` implementation at `costCalculator.ts:168` uses `mp.cogsOverrideIdr != null` which correctly admits `0`. Worth noting: the `update` mutation at `menuProducts/mutations.ts:283` uses `cogsOverrideIdr !== undefined` for the set-path check — also correct for `0`. No code change needed; adding a comment to both sites that `0` is intentionally valid would help future readers.

---

### IN-02: `updateUser` frontend call site does not propagate server error message

**File:** `src/pages/UsersManager.tsx:149-150`

```typescript
} catch (error) {
  toast.error("Failed to update user");  // swallows the server error message
}
```

All other error handlers in this file also swallow the message, but `handleUpdateUser` is the only one that performs validation-heavy work (salary, bank name). If the server throws a meaningful error (e.g., a future validation), the user sees a generic message. Minor but inconsistent with `handleCreateUser` at line 112 which does use `error.message`.

**Fix:**
```typescript
toast.error(error instanceof Error ? error.message : "Failed to update user");
```

---

### IN-03: `getOrderItemsByOrderNumbers` performs N sequential queries for N order numbers

**File:** `convex/integrations/internal/queries.ts:59-84`

The handler loops over `args.orderNumbers` and issues two sequential DB queries per number (one for the order, one for items). This is N+1 in the Convex query context. For typical internal sync batches of up to 100 orders (`BATCH_SIZE = 100`), this runs 200 sequential queries in one query function. While Convex query functions are not billed per read and this is not a performance scope item (v1), it does risk hitting Convex's query time limits on large backfills. Consider batching with `Promise.all` for the items queries after resolving all orders, or restructuring to use an index that can retrieve items by `orderId` set.

No immediate fix required — note for future optimization.

---

_Reviewed: 2026-04-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
