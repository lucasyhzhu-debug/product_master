---
phase: quick-14
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/orders/mutations/statusUpdates.ts
  - convex/orders/whatsapp.ts
autonomous: true
requirements: [QUICK-14]

must_haves:
  truths:
    - "Editing deliveryAddress via updateDetails syncs deliveryType and pickupLocation"
    - "WhatsApp templates show delivery address for orders with a non-pickup address regardless of deliveryType field"
  artifacts:
    - path: "convex/orders/mutations/statusUpdates.ts"
      provides: "updateDetails mutation with parseDeliveryAddress sync"
      contains: "parseDeliveryAddress"
    - path: "convex/orders/whatsapp.ts"
      provides: "smart delivery info that checks address content over deliveryType field"
  key_links:
    - from: "convex/orders/mutations/statusUpdates.ts"
      to: "convex/orders/helpers.ts"
      via: "import parseDeliveryAddress"
      pattern: "parseDeliveryAddress"
    - from: "convex/orders/whatsapp.ts"
      to: "order.deliveryAddress"
      via: "address-content check before deliveryType check"
      pattern: "PICKUP_PREFIX"
---

<objective>
Fix two delivery address bugs in the WhatsApp/order system:
1. `updateDetails` mutation ignores `deliveryAddress` changes when syncing `deliveryType`/`pickupLocation` — it saves the raw address but does not re-parse it like `editOrder` does in orderCrud.ts.
2. WhatsApp template delivery info only shows delivery address when `deliveryType === "Delivery"`, but an order may have a non-pickup address in `deliveryAddress` with a stale/incorrect `deliveryType` field.

Purpose: Ensure orders edited via the order detail panel (updateDetails) keep delivery type in sync, and WhatsApp templates always show delivery address when one is present and it is not a pickup.
Output: Two patched backend files.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

@convex/orders/helpers.ts
@convex/orders/mutations/statusUpdates.ts
@convex/orders/whatsapp.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Sync deliveryType/pickupLocation in updateDetails mutation</name>
  <files>convex/orders/mutations/statusUpdates.ts</files>
  <action>
    Add import of `parseDeliveryAddress` from `"../helpers"` at the top of the file (alongside existing imports from `"../helpers/index"`).

    In the `updateDetails` mutation handler, after the line:
    ```ts
    if (updates.deliveryAddress !== undefined)
      patchData.deliveryAddress = updates.deliveryAddress;
    ```
    Extend the block to also parse the address and sync deliveryType/pickupLocation:
    ```ts
    if (updates.deliveryAddress !== undefined) {
      patchData.deliveryAddress = updates.deliveryAddress;
      const parsed = parseDeliveryAddress(updates.deliveryAddress);
      patchData.deliveryType = parsed.deliveryType;
      patchData.pickupLocation = parsed.pickupLocation;
    }
    ```
    This mirrors the same logic already done in `editOrder` in orderCrud.ts (lines 770-775).

    NOTE: The `OrderDetailsUpdate` interface already has `deliveryType` and `pickupLocation` fields, so no type changes are needed.

    Do NOT modify any other logic in this file.
  </action>
  <verify>npm run type-check</verify>
  <done>TypeScript passes; deliveryAddress changes in updateDetails now sync deliveryType and pickupLocation via parseDeliveryAddress</done>
</task>

<task type="auto">
  <name>Task 2: Smart delivery info in WhatsApp template generation</name>
  <files>convex/orders/whatsapp.ts</files>
  <action>
    Add a module-level constant after the imports (or near the top of the file before the first function) for the pickup prefix regex, mirroring the one in helpers.ts:
    ```ts
    const PICKUP_PREFIX_RE = /^pick up:\s*/i;
    ```

    Then update the delivery info logic in TWO places within the file where `deliveryInfo` is built:

    **Place 1** — inside `buildTemplateVariables` function (around line 64):
    Replace:
    ```ts
    let deliveryInfo = "";
    if (order.deliveryType === "Pickup") {
      const location = order.pickupLocation || "Legato Gelato - Goldfinch";
      deliveryInfo = `📍 Pickup at: ${location}`;
    } else if (order.deliveryType === "Delivery" && order.deliveryAddress) {
      deliveryInfo = `📍 Delivery to: ${order.deliveryAddress}`;
    }
    ```
    With:
    ```ts
    let deliveryInfo = "";
    const isPickupAddress = order.deliveryAddress ? PICKUP_PREFIX_RE.test(order.deliveryAddress) : false;
    if (order.deliveryType === "Pickup" || isPickupAddress) {
      const location = order.pickupLocation || (order.deliveryAddress ? order.deliveryAddress.replace(PICKUP_PREFIX_RE, "").trim() : "") || "Legato Gelato - Goldfinch";
      deliveryInfo = `📍 Pickup at: ${location}`;
    } else if (order.deliveryAddress) {
      deliveryInfo = `📍 Delivery to: ${order.deliveryAddress}`;
    }
    ```

    **Place 2** — inside `generatePaymentRequest` function (around line 255):
    Replace:
    ```ts
    let deliveryInfo = "";
    if (order.deliveryType === "Pickup") {
      const location = order.pickupLocation || "Legato Gelato - Goldfinch";
      deliveryInfo = `📍 Pickup at: ${location}`;
    } else if (order.deliveryType === "Delivery" && order.deliveryAddress) {
      deliveryInfo = `📍 Delivery to: ${order.deliveryAddress}`;
    }
    ```
    With the same smart logic as Place 1 above.

    The key change: instead of gating delivery address display on `deliveryType === "Delivery"`, show delivery address whenever `deliveryAddress` is set and it is NOT a pickup prefix. This handles the case where `deliveryType` may be stale but the address is clearly a delivery address.

    Do NOT modify the `deliveryLine` sections in `generateReceipt` — those show "Type: X" explicitly and are less affected. Only the `deliveryInfo` sections (used in payment_request and the DB template variable `{delivery_info}`) need the fix.
  </action>
  <verify>npm run type-check && npm run build</verify>
  <done>TypeScript and build pass; WhatsApp templates show delivery address for orders with a non-pickup deliveryAddress regardless of the deliveryType field value</done>
</task>

</tasks>

<verification>
1. `npm run type-check` passes with no errors
2. `npm run build` succeeds
3. Manual check: In the Convex dashboard, edit an order's deliveryAddress via the order detail panel — confirm deliveryType and pickupLocation fields update accordingly
4. Manual check: Generate a WhatsApp payment_request template for an order that has a delivery address but deliveryType may be stale — confirm the delivery address appears in the message
</verification>

<success_criteria>
- `npm run type-check` passes
- `npm run build` succeeds
- `updateDetails` mutation syncs deliveryType/pickupLocation when deliveryAddress changes
- WhatsApp templates display delivery address for non-pickup addresses regardless of deliveryType field
</success_criteria>

<output>
After completion, create `.planning/quick/14-fix-whatsapp-template-delivery-address/14-SUMMARY.md`
</output>
