---
status: resolved
trigger: "Phase 24 UAT Test 3 — Ingredients Manager issues (3 issues)"
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T00:00:00Z
---

## Current Focus

hypothesis: All three issues investigated and diagnosed.
test: Complete static code analysis across all relevant files.
expecting: Findings delivered to implementer.
next_action: None — diagnosis complete.

## Symptoms

expected:
  1. Editing an ingredient and clicking Save should persist the changes.
  2. There should be a way to untrack / unlink an ingredient from its componentType.
  3. There should be an "Adjust" button on the Finished Goods inventory per-row to reduce stock
     for wastage, QA testing, freebies, etc.

actual:
  1. Save on ingredient edit is believed to fail.
  2. No untrack option visible anywhere in the UI.
  3. No Adjust button on the Finished Goods tab per-row — only Move and Receive.

errors: (none provided — UAT observation only)
reproduction: Interact with Ingredients page and Inventory > Finished Goods tab.
started: Phase 24 UAT

## Evidence

- timestamp: 2026-02-23
  checked: convex/ingredients/mutations.ts — update mutation
  found: >
    `update` uses `protectedMutation` (session-based auth, manager/admin roles).
    Does NOT take a `token: v.string()` arg — uses `useSessionMutation` pattern.
    Merges partial args with current DB values, recalculates costPerBaseUnit,
    then patches the record. Logic is sound.
  implication: Backend mutation is correct.

- timestamp: 2026-02-23
  checked: src/hooks/convex/useIngredients.ts — useConvexUpdateIngredient
  found: >
    Built via `createMutationHook(api.ingredients.mutations.update, ...)`.
    createMutationHook wraps `useSessionMutation` — the session token is injected
    automatically by convex-helpers SessionProvider, not passed by the caller.
    Returns `{ mutate, mutateAsync }`.
  implication: Hook plumbing is correct.

- timestamp: 2026-02-23
  checked: src/pages/IngredientsManager.tsx — onUpdate prop
  found: >
    Line 226: `onUpdate={(id, data) => update.mutate({ id: id as Id<"ingredients">, ...data })}`
    `update` comes from `useConvexUpdateIngredient()` which returns `{ mutate, mutateAsync }`.
    The onUpdate callback is `(id, data) => update.mutate(...)` — this is an async
    operation but the arrow function does NOT have `async` and does NOT return the promise.
  implication: POTENTIAL ISSUE — if EntityManager awaits onUpdate, the non-returned promise
    may cause it to proceed before the mutation settles. However EntityManager.handleFormSubmit
    (line 317) does `await onUpdate(editingItem._id, transformed)` which will resolve
    immediately to `undefined` since the arrow function returns nothing. The mutation still
    fires and completes. The dialog WILL close. The toast shows "Ingredient updated" from
    EntityManager (line 319), while createMutationHook ALSO shows "Ingredient updated
    successfully" from the hook — causing a DOUBLE TOAST.

- timestamp: 2026-02-23
  checked: src/components/shared/EntityManager.tsx — handleFormSubmit
  found: >
    Lines 313-333: handleFormSubmit awaits onUpdate, shows success toast on line 319,
    closes dialog on 324. The call `await onUpdate(...)` will resolve to undefined
    because the IngredientsManager callback does not return the promise. The mutation
    fires and runs. The save DOES work — two success toasts appear but the data saves.
  implication: Issue 1 is NOT a broken save — it appears to work. However there is a
    double-toast bug. If the user is seeing NO feedback or the dialog not closing, the
    issue might be something else. See root cause section.

- timestamp: 2026-02-23
  checked: convex/ingredients/mutations.ts — linkIngredientToComponentType
  found: >
    Only accepts `ingredientId` and `componentTypeId` (non-null). There is no mutation
    that accepts `componentTypeId: null` to unlink. No `unlinkIngredientFromComponentType`
    mutation exists anywhere in convex/ingredients/.
  implication: Issue 2 — no backend unlink mutation exists. Complete gap.

- timestamp: 2026-02-23
  checked: src/pages/IngredientsManager.tsx — tracking column render (lines 160-172)
  found: >
    When `item.ingredientComponentTypeId` is set, the cell renders only a "Tracked" badge.
    No button or action to untrack/unlink. The "Enable Tracking" and "Link existing" buttons
    only appear when the field is undefined.
  implication: Issue 2 — no UI for unlinking exists. Complete frontend gap.

- timestamp: 2026-02-23
  checked: convex/productInventory/mutations.ts — adjustStock mutation
  found: >
    `adjustStock` already exists (lines 97-173). Takes `token`, `menuProductId`,
    `locationId`, `quantity` (positive or negative), `reason` (required string).
    Manager/admin only. Logs transactionType "adjust". Allows stock to go negative.
    This is a generic adjustment — there's no category enum (wastage, free-trial, etc.).
  implication: Issue 3 — BACKEND IS COMPLETE. The mutation for adjusting stock already
    exists. The gap is purely frontend: no UI in FinishedGoodsTab exposes this mutation.

- timestamp: 2026-02-23
  checked: convex/schema.ts — productInventoryTransactions table
  found: >
    transactionType union: "add" | "drawdown" | "gofood_sale" | "adjust" | "transfer".
    The "adjust" type is already defined and used. The `reason` field is optional string.
    No category enum (wastage, free-trial, etc.) exists in schema — reason is free text.
  implication: Issue 3 — schema supports adjust. Category enum would need schema change
    if structured categories are wanted, OR can be handled as prefixed free-text reasons
    in UI only (no schema change needed).

- timestamp: 2026-02-23
  checked: src/components/inventory/FinishedGoodsTab.tsx — ProductGroupedView row actions
  found: >
    Lines 410-459: Each location row has "Move" (ArrowRight) and "Receive" (ArrowLeft) buttons.
    No "Adjust" button. The tab imports and uses `transferStockMutation` but no
    `adjustStockMutation`. No AdjustDialog component exists in inventory/ folder.
  implication: Issue 3 — frontend gap confirmed. Need Adjust button + modal in UI.

## Eliminated

- hypothesis: Issue 1 — save mutation doesn't exist on backend
  evidence: update mutation exists at convex/ingredients/mutations.ts line 54
  timestamp: 2026-02-23

- hypothesis: Issue 1 — hook is wired to wrong mutation reference
  evidence: useConvexUpdateIngredient correctly references api.ingredients.mutations.update
  timestamp: 2026-02-23

- hypothesis: Issue 1 — EntityManager never calls onUpdate
  evidence: handleFormSubmit at line 317 explicitly calls `await onUpdate(editingItem._id, transformed)`
  timestamp: 2026-02-23

## Resolution

root_cause: |
  ISSUE 1 — DOUBLE TOAST (minor bug, not a broken save):
    The `onUpdate` callback in IngredientsManager.tsx line 226 does not return the promise
    from `update.mutate(...)`. `EntityManager.handleFormSubmit` awaits it, gets `undefined`
    immediately, shows "Ingredient updated" toast and closes the dialog. Meanwhile,
    `createMutationHook` ALSO fires "Ingredient updated successfully" as a second toast.
    The ACTUAL SAVE WORKS. If user thinks it's broken, they may be confused by the double
    toast, or the save is genuinely failing for another reason (e.g., session expired,
    role mismatch). The dialog does close. The primary fix is to return the promise so
    the await in EntityManager actually waits for the mutation.

  ISSUE 2 — COMPLETE FEATURE GAP (backend + frontend):
    No `unlinkIngredientFromComponentType` mutation exists in convex/ingredients/mutations.ts.
    The `linkIngredientToComponentType` mutation does not support null/undefined componentTypeId.
    In the UI, once an ingredient shows "Tracked" badge, there is no control to reverse it.
    Both a backend mutation and a frontend "Untrack" button in the Inventory column are needed.

  ISSUE 3 — FRONTEND-ONLY GAP (backend complete):
    `convex/productInventory/mutations.ts` already has `adjustStock` (lines 97-173) that
    accepts quantity (positive or negative), reason, menuProductId, locationId, and token.
    The schema already has transactionType "adjust". A `reason` string is required.
    The only gap is the UI: no "Adjust" button per row in FinishedGoodsTab, and no modal
    to enter quantity, reason, and optionally a category. The adjustStock mutation supports
    the full user story already — just needs to be wired up in the frontend.

fix: |
  ISSUE 1 (double toast fix):
    File: src/pages/IngredientsManager.tsx, line 226
    Change:
      onUpdate={(id, data) => update.mutate({ id: id as Id<"ingredients">, ...data })}
    To:
      onUpdate={(id, data) => update.mutate({ id: id as Id<"ingredients">, ...data })}
      ... but prepend `return` OR make it async-returning:
      onUpdate={async (id, data) => { await update.mutate({ id: id as Id<"ingredients">, ...data }); }}
    AND: Either remove toast in EntityManager.handleFormSubmit line 319, or remove
    successMessage from createMutationHook config in useIngredients.ts to avoid double toast.

  ISSUE 2 (untrack ingredient):
    Backend: Add mutation to convex/ingredients/mutations.ts:
      export const unlinkIngredientFromComponentType = mutation({
        args: { token: v.string(), ingredientId: v.id("ingredients") },
        handler: async (ctx, args) => {
          await requireRole(ctx, args.token, ["admin"]);
          await ctx.db.patch(args.ingredientId, { ingredientComponentTypeId: undefined });
          return { success: true };
        },
      });
    Hook: Add useUnlinkIngredientFromComponentType to useIngredients.ts
    Frontend: In IngredientsManager.tsx, the "Tracked" badge cell (lines 162-165) needs
      an "Untrack" button alongside the badge that calls the new mutation.

  ISSUE 3 (Adjust button for finished goods):
    New component: src/components/inventory/FGAdjustDialog.tsx
      Props: menuProductId, menuProductName, locationId, locationName, currentQuantity, onClose
      Form fields:
        - Category select (for UX only, no schema change): Wastage, Free Trial / QC Sample,
          Manual Correction, Freebie/Gift — prepends to reason string
        - Quantity to deduct (positive integer) — passed as negative to adjustStock
        - Freetext notes (optional extra context)
        - Submit calls api.productInventory.mutations.adjustStock with:
            token, menuProductId, locationId,
            quantity: -(enteredQty), reason: `[Category]: notes`
    Frontend wiring in src/components/inventory/FinishedGoodsTab.tsx:
      - Import FGAdjustDialog, import useMutation for adjustStock
      - In ProductGroupedView and LocationGroupedView, add "Adjust" button per location row
        (after "Receive", style it as outline/amber or destructive-outline)
      - Track `adjustDialogState` similarly to openInline state
      - Pass token from user context to the mutation

verification: Static analysis complete — no runtime test run. Findings based on full
  code review of all relevant files.

files_changed: []
