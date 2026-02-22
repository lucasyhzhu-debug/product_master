---
phase: quick-16
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/productInventory/mutations.ts
  - src/components/inventory/FulfillFromInventoryButton.tsx
autonomous: true
requirements: [QUICK-16]

must_haves:
  truths:
    - "Use Available Inventory panel is visible on BeingPrepared orders"
    - "Confirming drawdown on a BeingPrepared order advances it to AwaitingDelivery"
    - "Audit log records correct fromStatus (BeingPrepared, not PaymentReceived)"
    - "PaymentReceived behavior is unchanged"
  artifacts:
    - path: "convex/productInventory/mutations.ts"
      provides: "fulfillFromInventory mutation accepting PaymentReceived OR BeingPrepared"
    - path: "src/components/inventory/FulfillFromInventoryButton.tsx"
      provides: "Panel visible for both PaymentReceived and BeingPrepared"
  key_links:
    - from: "FulfillFromInventoryButton"
      to: "fulfillFromInventory mutation"
      via: "orderStatus guard allows 'BeingPrepared'"
    - from: "fulfillFromInventory mutation"
      to: "ctx.db.patch orders"
      via: "always sets status: AwaitingDelivery, isKitchenVisible: false"
---

<objective>
Allow "Use Available Inventory" (fulfillFromInventory) on orders in BeingPrepared status, not just PaymentReceived.

Purpose: When an order is already in the kitchen queue (BeingPrepared), staff may realize existing stock is available and want to use it instead — bypassing kitchen production and advancing directly to AwaitingDelivery.
Output: Two-file change — backend relaxes status guard, frontend shows panel for both statuses.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@convex/productInventory/mutations.ts
@src/components/inventory/FulfillFromInventoryButton.tsx
@convex/orders/helpers/statusTransitions.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Relax backend status guard to accept BeingPrepared</name>
  <files>convex/productInventory/mutations.ts</files>
  <action>
In the `fulfillFromInventory` mutation handler (around line 223), change the status validation from:

```typescript
if (order.status !== "PaymentReceived") {
  throw new Error(
    `Order must be in "Payment Received" status to fulfill from inventory. Current status: ${order.status}`
  );
}
```

To:

```typescript
if (order.status !== "PaymentReceived" && order.status !== "BeingPrepared") {
  throw new Error(
    `Order must be in "Payment Received" or "Being Prepared" status to fulfill from inventory. Current status: ${order.status}`
  );
}
```

Then update the `logStatusTransition` call (around line 341) to use the actual order status instead of the hardcoded literal "PaymentReceived":

```typescript
await logStatusTransition(
  ctx,
  args.orderId,
  order.status,  // was hardcoded "PaymentReceived"
  "AwaitingDelivery",
  "Fulfilled from inventory (skipped production)",
  "user",
  user._id
);
```

Also update the inline comment on the `ctx.db.patch` call (line 332) to say:
"Advance order status: PaymentReceived | BeingPrepared -> AwaitingDelivery"

The `isKitchenVisible: false` patch is already correct — BeingPrepared orders are kitchen-visible, so clearing that flag is the right behavior when fulfilling from inventory.
  </action>
  <verify>npm run type-check (no TypeScript errors in convex/productInventory/mutations.ts)</verify>
  <done>fulfillFromInventory accepts PaymentReceived OR BeingPrepared; any other status still throws; audit log uses dynamic fromStatus</done>
</task>

<task type="auto">
  <name>Task 2: Show inventory panel on BeingPrepared orders in frontend</name>
  <files>src/components/inventory/FulfillFromInventoryButton.tsx</files>
  <action>
In `FulfillFromInventoryButton` (line 51), change the guard from:

```typescript
if (orderStatus !== 'PaymentReceived') {
  return null;
}
```

To:

```typescript
if (orderStatus !== 'PaymentReceived' && orderStatus !== 'BeingPrepared') {
  return null;
}
```

Also update the file-level JSDoc comment (lines 4-8) to reflect the new behavior:

```typescript
 * - Only visible when order status is PaymentReceived or BeingPrepared
```

Update the descriptive paragraph inside `FulfillFromInventoryPanel` (line 154) to be accurate for both contexts:

Change:
```
Skip kitchen production and fulfill this order directly from finished goods stock.
```

To:
```
Fulfill this order directly from finished goods stock. Order will advance to Awaiting Delivery.
```

No other changes needed — the panel, location selector, availability check, and confirm button all work identically regardless of which of the two statuses triggered the render.
  </action>
  <verify>npm run build (no TypeScript or build errors); visually confirm the panel appears on a BeingPrepared order in dev</verify>
  <done>FulfillFromInventoryButton renders for both PaymentReceived and BeingPrepared; returns null for all other statuses; descriptive text is accurate</done>
</task>

</tasks>

<verification>
1. `npm run type-check` passes with no errors
2. `npm run build` succeeds
3. In dev: open an order in BeingPrepared status — "Use Available Inventory" card appears
4. In dev: open an order in PaymentReceived status — card still appears (regression check)
5. In dev: open an order in AwaitingDelivery status — card is NOT shown (guard holds)
6. Confirm a BeingPrepared order via inventory drawdown — order advances to AwaitingDelivery, toast appears, audit trail shows `fromStatus: "BeingPrepared"`
</verification>

<success_criteria>
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] "Use Available Inventory" panel visible on BeingPrepared orders
- [ ] Confirming drawdown on BeingPrepared moves order to AwaitingDelivery
- [ ] PaymentReceived path unchanged
- [ ] No TypeScript errors introduced
</success_criteria>

<output>
After completion, create `.planning/quick/16-allow-use-from-inventory-in-being-prepar/16-SUMMARY.md`
</output>
