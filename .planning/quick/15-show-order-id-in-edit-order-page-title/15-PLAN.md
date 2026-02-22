---
phase: 15-show-order-id-in-edit-order-page-title
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/pages/OrderCreate.tsx
autonomous: true
requirements:
  - QT-15
must_haves:
  truths:
    - "Page title shows 'Edit Order 0222-009' (with real order number) when editing an order that has an orderNumber"
    - "Page title shows 'Edit Draft' when editing an order without an orderNumber (new draft not yet submitted)"
    - "Page title still shows 'New Order' when creating a fresh order"
  artifacts:
    - path: "src/pages/OrderCreate.tsx"
      provides: "Dynamic page title derived from existingOrder.orderNumber"
      contains: "existingOrder?.orderNumber"
  key_links:
    - from: "OrderCreate.tsx PageHeader title"
      to: "existingOrder.orderNumber"
      via: "conditional string interpolation"
      pattern: "existingOrder\\??\\.orderNumber"
---

<objective>
Show the actual order ID in the edit order page title instead of the generic "Edit Draft" label.

Purpose: Staff can immediately confirm which order they are editing without scanning the form content.
Output: PageHeader title reads "Edit Order 0222-009" (or "Edit Order MMDD-NNN") when editing any order that has an orderNumber field.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Dynamic page title with order number</name>
  <files>src/pages/OrderCreate.tsx</files>
  <action>
    In `src/pages/OrderCreate.tsx`, update the `PageHeader` title and description (lines ~515–520) to include the order number when available.

    Current code:
    ```tsx
    <PageHeader
      title={isEditMode ? "Edit Draft" : "New Order"}
      description={isEditMode ? "Resume editing draft order" : "Create a new order"}
      backTo="/orders"
      backLabel="Orders"
    />
    ```

    Replace with:
    ```tsx
    <PageHeader
      title={isEditMode
        ? existingOrder?.orderNumber
          ? `Edit Order ${existingOrder.orderNumber}`
          : "Edit Draft"
        : "New Order"}
      description={isEditMode ? "Resume editing draft order" : "Create a new order"}
      backTo="/orders"
      backLabel="Orders"
    />
    ```

    Logic:
    - `isEditMode` is false → "New Order" (unchanged)
    - `isEditMode` is true AND `existingOrder?.orderNumber` exists → "Edit Order {orderNumber}" (e.g., "Edit Order 0222-009")
    - `isEditMode` is true AND no `orderNumber` (pure Draft) → "Edit Draft" (unchanged fallback)

    No other changes needed. `existingOrder` is already fetched via `useQuery(api.orders.queries.get, ...)` at line 51. `orderNumber` is a `v.string()` field in the `orders` table schema.
  </action>
  <verify>
    1. `npm run type-check` passes with no errors
    2. `npm run build` succeeds
    3. Manually navigate to `/orders/create?draft={id-of-order-with-orderNumber}` and confirm the page header reads "Edit Order MMDD-NNN"
    4. Navigate to `/orders/create?draft={id-of-pure-draft}` and confirm the page header reads "Edit Draft"
    5. Navigate to `/orders/create` (no draft param) and confirm the page header reads "New Order"
  </verify>
  <done>
    PageHeader title is "Edit Order {orderNumber}" when editing an order with a known order number, "Edit Draft" when editing a pure draft, and "New Order" for new order creation.
  </done>
</task>

</tasks>

<verification>
- `npm run type-check` passes
- `npm run build` succeeds
- Page title correctly reflects order number vs draft state
</verification>

<success_criteria>
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] Title shows "Edit Order 0222-009" format when order has orderNumber
- [ ] Title falls back to "Edit Draft" when no orderNumber (pure new draft)
- [ ] Title shows "New Order" for fresh order creation
</success_criteria>

<output>
After completion, create `.planning/quick/15-show-order-id-in-edit-order-page-title/15-SUMMARY.md`
</output>
