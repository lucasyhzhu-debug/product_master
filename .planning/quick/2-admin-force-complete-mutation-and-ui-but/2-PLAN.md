---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/orders/mutations/statusUpdates.ts
  - convex/orders/mutations/index.ts
  - src/pages/OrderDetail.tsx
autonomous: true
must_haves:
  truths:
    - "Admin can force-complete a non-terminal order to Complete+Paid status"
    - "Non-admin users cannot see or trigger the force-complete action"
    - "Force-complete does NOT trigger any inventory side effects (no stock reservation, no material consumption)"
    - "Audit trail records the force-complete with admin_force_complete event type and data_fix category"
  artifacts:
    - path: "convex/orders/mutations/statusUpdates.ts"
      provides: "forceComplete admin mutation"
      contains: "export const forceComplete"
    - path: "convex/orders/mutations/index.ts"
      provides: "barrel export for forceComplete"
      contains: "forceComplete"
    - path: "src/pages/OrderDetail.tsx"
      provides: "Admin-only Force Complete button with confirm dialog"
      contains: "forceComplete"
  key_links:
    - from: "src/pages/OrderDetail.tsx"
      to: "convex/orders/mutations/statusUpdates.ts"
      via: "useMutation(api.orders.mutations.forceComplete)"
      pattern: "api\\.orders\\.mutations\\.forceComplete"
    - from: "convex/orders/mutations/statusUpdates.ts"
      to: "convex/orders/helpers/statusTransitions.ts"
      via: "logOrderEvent + logStatusTransition"
      pattern: "logOrderEvent.*admin_force_complete"
---

<objective>
Add an admin-only "Force Complete" mutation and UI button to mark stuck orders as Complete+Paid without triggering inventory side effects.

Purpose: Orders stuck in non-terminal statuses (e.g., AwaitingPayment) after already being delivered need an admin escape hatch for data cleanup.
Output: Backend mutation + frontend button with confirmation dialog on OrderDetail page.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@convex/orders/mutations/statusUpdates.ts
@convex/orders/mutations/index.ts
@convex/orders/helpers/statusTransitions.ts
@src/pages/OrderDetail.tsx
@src/contexts/AuthContext.tsx
@convex/lib/auth.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add forceComplete mutation and export</name>
  <files>convex/orders/mutations/statusUpdates.ts, convex/orders/mutations/index.ts</files>
  <action>
Add a new `forceComplete` mutation at the end of `convex/orders/mutations/statusUpdates.ts`:

```typescript
export const forceComplete = mutation({
  args: {
    orderId: v.id("orders"),
    token: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Admin-only
    const user = await requireRole(ctx, args.token, ["admin"]);

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    if (isTerminalStatus(order.status)) {
      throw new Error(`Order is already ${order.status}`);
    }

    const oldStatus = order.status;

    // Force to Complete + Paid, no inventory side effects
    await ctx.db.patch(args.orderId, {
      status: "Complete",
      completedAt: Date.now(),
      isKitchenVisible: false,
      paymentStatus: "Paid",
      // Ensure confirmedAt exists for revenue tracking
      ...(order.confirmedAt ? {} : { confirmedAt: Date.now() }),
    });

    // Audit: log the force-complete event
    await logOrderEvent(ctx, args.orderId, "admin_force_complete", {
      fromStatus: oldStatus,
      toStatus: "Complete",
      reason: args.reason ?? "Admin force complete - data fix",
      category: "data_fix",
      triggeredBy: "user",
      userId: user._id,
      metadata: {
        paymentStatusSet: "Paid",
        inventorySideEffects: false,
      },
    });

    // Also log as a status transition for the status history timeline
    await logStatusTransition(
      ctx,
      args.orderId,
      oldStatus,
      "Complete",
      args.reason ?? "Admin force complete - data fix",
      "user",
      user._id
    );

    return args.orderId;
  },
});
```

Import `requireRole` from `../../lib/auth` (note: `getSessionUser` is already imported; add `requireRole` to the existing auth import or add a new import line).

Then in `convex/orders/mutations/index.ts`, add `forceComplete` to the Status Updates export block:
```typescript
export {
  updateStatus,
  updatePayment,
  updateShipping,
  updateDetails,
  forceComplete,
} from "./statusUpdates";
```
  </action>
  <verify>Run `npm run type-check` -- should pass with no errors related to forceComplete.</verify>
  <done>forceComplete mutation exists, is admin-gated via requireRole, patches status/paymentStatus without calling any inventory integration functions, logs both an orderEvent and a statusTransition, and is exported from the barrel file.</done>
</task>

<task type="auto">
  <name>Task 2: Add Force Complete button to OrderDetail page</name>
  <files>src/pages/OrderDetail.tsx</files>
  <action>
In `src/pages/OrderDetail.tsx`:

1. Add imports:
   - `import { useAuth } from '@/contexts/AuthContext';`
   - `import { useMutation } from 'convex/react';` (already imported via hooks -- check; if not, add)
   - `import { toast } from 'sonner';` (check if already imported)
   - `import { Textarea } from '@/components/ui/textarea';` (if not already imported)
   - Add `ShieldAlert` to the lucide-react imports (for the button icon)

2. Inside the `OrderDetail` component, after the existing state declarations:
   ```typescript
   const { user } = useAuth();
   const isAdmin = user?.role === 'admin';
   const forceCompleteMutation = useMutation(api.orders.mutations.forceComplete);
   const [showForceCompleteDialog, setShowForceCompleteDialog] = useState(false);
   const [forceCompleteReason, setForceCompleteReason] = useState('');
   ```
   IMPORTANT: Place ALL hooks (useAuth, useMutation, useState) BEFORE any conditional returns (the loading/not-found checks around lines 164-184). This is a React hooks rule.

3. Add a handler:
   ```typescript
   const handleForceComplete = async () => {
     if (!orderId) return;
     try {
       await forceCompleteMutation({
         orderId,
         token: user?.token ?? '',
         reason: forceCompleteReason || undefined,
       });
       toast.success('Order force-completed successfully');
       setShowForceCompleteDialog(false);
       setForceCompleteReason('');
     } catch (error) {
       toast.error(error instanceof Error ? error.message : 'Failed to force-complete order');
     }
   };
   ```

4. In the right column (the `lg:col-span-1` div), AFTER the "Cancel Order" HoldButton block (around line 476) and BEFORE the closing `</div>` of the right column, add an admin-only Force Complete section:
   ```tsx
   {/* Admin: Force Complete (data fix) */}
   {isAdmin && !['Complete', 'Cancelled'].includes(order.status) && (
     <div className="pt-2">
       <Button
         variant="outline"
         size="sm"
         className="w-full text-amber-700 border-amber-300 hover:bg-amber-50 hover:text-amber-800"
         onClick={() => setShowForceCompleteDialog(true)}
       >
         <ShieldAlert className="h-3 w-3 mr-1" />
         Force Complete (Admin)
       </Button>
     </div>
   )}
   ```

5. Add the ConfirmDialog AFTER the existing `EnhancedCancellationDialog` (around line 497), before the closing `</div>` of the component:
   ```tsx
   <ConfirmDialog
     open={showForceCompleteDialog}
     onOpenChange={(open) => {
       setShowForceCompleteDialog(open);
       if (!open) setForceCompleteReason('');
     }}
     title="Force Complete Order?"
     description="This will mark the order as Complete and Paid without affecting inventory. Use only for data fixes."
     onConfirm={handleForceComplete}
     confirmLabel="Force Complete"
     variant="destructive"
   >
     <div className="space-y-2 pt-2">
       <Label className="text-sm">Reason (optional)</Label>
       <Textarea
         placeholder="e.g., Order already delivered but stuck in AwaitingPayment"
         value={forceCompleteReason}
         onChange={(e) => setForceCompleteReason(e.target.value)}
         rows={2}
       />
     </div>
   </ConfirmDialog>
   ```

   Note: Check if `ConfirmDialog` supports children for extra content. If it does NOT support children, instead add the reason input as a separate element above the button that opens the dialog, or use an `AlertDialog` directly (following the pattern in `StatusActionButtons.tsx`). The existing `ConfirmDialog` from `@/components/shared` is already imported.
  </action>
  <verify>Run `npm run build` -- should pass. Visually: the Force Complete button should only render for admin users on non-terminal orders.</verify>
  <done>Admin users see a "Force Complete (Admin)" button on OrderDetail for non-terminal orders. Clicking shows a confirm dialog with optional reason input. Confirming calls the forceComplete mutation and shows toast feedback. Non-admin users see nothing.</done>
</task>

</tasks>

<verification>
- `npm run type-check` passes
- `npm run build` succeeds
- The `forceComplete` mutation is exported and callable
- No inventory integration functions are called in forceComplete (grep confirms no `reserveStock`, `consumeProduction`, `consumeBoxing`, `consumeSticker`, `releaseReservation` references)
- Button visibility is gated on `isAdmin && !terminal`
</verification>

<success_criteria>
- `npm run type-check` passes
- `npm run build` succeeds
- Admin can force-complete an AwaitingPayment order without inventory changes
- Non-admin users cannot see or use the button
- Audit trail records the force-complete with data_fix category
</success_criteria>

<output>
After completion, create `.planning/quick/2-admin-force-complete-mutation-and-ui-but/2-SUMMARY.md`
</output>
