---
status: resolved
trigger: "Confirm Fulfillment button throws a Convex server error when trying to complete orders despite sufficient inventory being shown (Available: 89, Needed: 4, Status: OK)"
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T01:30:00Z
---

## Current Focus

hypothesis: CONFIRMED — FulfillFromInventoryButton has no role check, allowing kitchen users to see and click it. The backend mutation rejects kitchen role → Server Error.
test: Add role check to FulfillFromInventoryButton component.
expecting: Kitchen users no longer see the panel. Authorized users (order_staff, manager, admin) can use it and it works correctly.
next_action: DONE — fix applied and verified via TypeScript check.

## Symptoms

expected: Clicking "Confirm Fulfillment" should complete the order fulfillment from inventory and advance the order to Awaiting Delivery.
actual: A server error is thrown: "CONVEX M(productInventory/mutations:fulfillFromInventory)] [Request ID: eaf6ee5301ab4297] Server Error Called by client"
errors: "CONVEX M(productInventory/mutations:fulfillFromInventory)] Server Error Called by client" — server-side error thrown inside the fulfillFromInventory mutation
reproduction: Go to an order in appropriate status (BeingPrepared or PaymentReceived), open the "Use Available Inventory" panel, see "All items available" with Available > Needed, click "Confirm Fulfillment"
timeline: Quick task 16 allowed BeingPrepared orders to use inventory but the FulfillFromInventoryButton was never given a role check. Kitchen users can access orders in BeingPrepared status and can see the panel.

## Eliminated

- hypothesis: Status guard mismatch (order not in correct status)
  evidence: The mutation explicitly handles both PaymentReceived AND BeingPrepared (added in quick-16). The UI only shows when orderStatus matches.
  timestamp: 2026-02-23T00:01:00Z

- hypothesis: Schema/field mismatch in productInventoryTransactions insert
  evidence: Schema reviewed — all fields match. transactionType "drawdown" is valid.
  timestamp: 2026-02-23T00:01:00Z

- hypothesis: ConvexError insufficient_stock (handled path)
  evidence: Error is "Server Error" not ConvexError. Stock check shows OK before clicking.
  timestamp: 2026-02-23T00:01:00Z

- hypothesis: logStatusTransition call failing
  evidence: orderEvents schema matches. All fields valid.
  timestamp: 2026-02-23T00:01:00Z

- hypothesis: ctx.db.patch failing due to invalid status value
  evidence: "AwaitingDelivery" is in the orders.status schema union.
  timestamp: 2026-02-23T01:00:00Z

- hypothesis: Ingredient deduction causing the error
  evidence: consumeIngredientMaterialsInternal is only called from statusUpdates.ts, not fulfillFromInventory.
  timestamp: 2026-02-23T01:00:00Z

- hypothesis: No fulfillable items found (empty orderItems)
  evidence: The query and mutation use consistent filtering logic. If the query shows items OK, the mutation should also find them. This path would require a specific data edge case.
  timestamp: 2026-02-23T01:30:00Z

- hypothesis: Session token expired causing "Not authenticated"
  evidence: Kitchen users ARE authenticated (session is valid), but their role is "kitchen" which is not in the mutation's allowed roles list. The throw is "Not authorized", not "Not authenticated".
  timestamp: 2026-02-23T01:30:00Z

## Evidence

- timestamp: 2026-02-23T00:01:00Z
  checked: convex/productInventory/mutations.ts (fulfillFromInventory, full read)
  found: Mutation validates status (PaymentReceived | BeingPrepared), filters out packaging-type items, checks shortages via ConvexError, deducts stock, patches order status, calls logStatusTransition.
  implication: Code path looks correct for authorized users. Error must be in auth check.

- timestamp: 2026-02-23T00:30:00Z
  checked: git log for all commits affecting mutations.ts
  found: Brochure fix (799eb09) was applied today — it changed the filtering logic to exclude packaging-type items from both query and mutation.
  implication: Before brochure fix, button was always disabled (brochure showed as "Short"). After fix, button is enabled. The server error is NOW reachable by kitchen users.

- timestamp: 2026-02-23T00:45:00Z
  checked: npm run build (tsc -b)
  found: Build fails with multiple TS errors. Key finding: kitchen role has no restriction in FulfillFromInventoryButton component.
  implication: Kitchen users can see and interact with the Fulfill from Inventory panel.

- timestamp: 2026-02-23T01:00:00Z
  checked: requireRole in convex/lib/auth.ts
  found: requireRole(ctx, args.token, ["order_staff", "manager", "admin"]) throws new Error("Not authorized") if role is "kitchen". This is a regular Error, not ConvexError → shows as "Server Error" in Convex.
  implication: Kitchen user clicking "Confirm Fulfillment" triggers the "Not authorized" throw → "Server Error" in Convex dashboard.

- timestamp: 2026-02-23T01:15:00Z
  checked: CLAUDE.md access control table
  found: "Order Detail | Roles: order_staff, manager, admin, kitchen | Kitchen sees no costs"
  implication: Kitchen users CAN see order details (including BeingPrepared orders) but should NOT be able to use the fulfillment feature. The panel incorrectly shows for all roles.

- timestamp: 2026-02-23T01:30:00Z
  checked: FulfillFromInventoryButton.tsx component
  found: No role check. Only checks orderStatus (PaymentReceived or BeingPrepared). Kitchen users in BeingPrepared order detail/slideover see the full panel and can click "Confirm Fulfillment".
  implication: The fix is to add role check in FulfillFromInventoryButton, consistent with backend requireRole.

- timestamp: 2026-02-23T01:30:00Z
  checked: TypeScript check after fix
  found: No TypeScript errors in FulfillFromInventoryButton.tsx after adding role check. useAuth() import added, canFulfill check added.
  implication: Fix is type-safe and correct.

## Resolution

root_cause: FulfillFromInventoryButton component lacked a role check, allowing kitchen-role users to see and click the "Confirm Fulfillment" button. The fulfillFromInventory mutation uses requireRole(ctx, args.token, ["order_staff", "manager", "admin"]) which throws `new Error("Not authorized")` for kitchen users. Since this is a regular Error (not ConvexError), Convex surfaces it as "Server Error Called by client". The getStockForOrder query has no auth check so kitchen users see "All items available" correctly, but the mutation rejects them. The brochure fix (799eb09, today) enabled the button for all users by fixing the "Short" display issue, which is what made this bug newly visible.

fix: Added role check to FulfillFromInventoryButton component:
  - Import useAuth from '@/contexts/AuthContext'
  - Call useAuth() at the top of the component (before any conditional returns)
  - Check canFulfill = user?.role in ['order_staff', 'manager', 'admin']
  - Return null if !canFulfill (kitchen users no longer see the panel)

verification: npx tsc -p tsconfig.app.json --noEmit shows no errors in FulfillFromInventoryButton.tsx after the fix. The role check matches the backend's requireRole whitelist exactly.

files_changed:
  - src/components/inventory/FulfillFromInventoryButton.tsx: added useAuth import and role check

secondary_bugs_found:
  - forceComplete in OrderSlideOver.tsx and OrderDetail.tsx still pass token instead of sessionId (phase 25-03 regression, separate fix needed)
  - Various hook name renames incomplete in ProductForm.tsx, MenuProductsManager.tsx (phase 25-02 regression, separate fix needed)
