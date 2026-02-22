---
phase: quick-19-replace-hand-rolled-items-pricing-block
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/orders/OrderSlideOver.tsx
autonomous: true
requirements:
  - QUICK-19

must_haves:
  truths:
    - "OrderSlideOver renders items and pricing via the shared OrderItems component"
    - "Delivery fee display and edit input appear in OrderSlideOver (no longer invisible)"
    - "No duplicate hand-rolled items+pricing block exists in OrderSlideOver"
    - "npm run type-check and npm run build pass with no errors"
  artifacts:
    - path: "src/components/orders/OrderSlideOver.tsx"
      provides: "Slide-over panel using shared OrderItems instead of hand-rolled list"
      contains: "import { OrderItems }"
  key_links:
    - from: "src/components/orders/OrderSlideOver.tsx"
      to: "src/components/orders/OrderItems.tsx"
      via: "<OrderItems> component with camelCase->snake_case field mapping"
      pattern: "<OrderItems"
---

<objective>
Replace the ~80-line hand-rolled items+pricing block in OrderSlideOver with the shared OrderItems component.

Purpose: Quick-18 added a delivery fee input to OrderItems, but it was invisible in the slide-over because OrderSlideOver had its own duplicated items+pricing UI. This change eliminates the duplicate, making all OrderItems improvements (including delivery fee) visible everywhere.
Output: OrderSlideOver.tsx with OrderItems imported and rendered, hand-rolled block removed.
</objective>

<execution_context>
Implementation is already complete. Tasks verify build correctness and commit.
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify build passes</name>
  <files>src/components/orders/OrderSlideOver.tsx</files>
  <action>
    Run type-check and build to confirm the implementation is correct.

    Expected: OrderSlideOver.tsx no longer imports `formatCurrency` from `@/lib/utils` (unused after removal), imports `OrderItems` from `./OrderItems`, and renders `<OrderItems>` with camelCase-to-snake_case field mapping for `productName->product_name`, `unitPrice->unit_price`, `lineTotal->line_total`, plus delivery fee props (`deliveryFee`, `orderId`, `canEditDeliveryFee`).

    Run:
    ```
    npm run type-check
    npm run build
    ```
  </action>
  <verify>Both commands exit with code 0 and no TypeScript errors referencing OrderSlideOver.tsx</verify>
  <done>type-check and build succeed clean; no TS errors in OrderSlideOver.tsx</done>
</task>

<task type="auto">
  <name>Task 2: Commit the change</name>
  <files>src/components/orders/OrderSlideOver.tsx</files>
  <action>
    Stage and commit the modified file on the current branch `gsd/phase-19-gofood-depot-management-and-kitchen-production-targets`.

    ```bash
    git add src/components/orders/OrderSlideOver.tsx
    git commit -m "refactor(quick-19): replace hand-rolled items+pricing block in OrderSlideOver with shared OrderItems component"
    ```

    This eliminates the duplicate UI so all OrderItems improvements (delivery fee input from quick-18) are visible in the slide-over panel.
  </action>
  <verify>git log --oneline -1 shows the commit message above on the current branch</verify>
  <done>Commit exists on branch; OrderSlideOver.tsx uses OrderItems everywhere delivery fee and item pricing UI is needed</done>
</task>

</tasks>

<verification>
- `npm run type-check` passes
- `npm run build` passes
- `git log --oneline -1` shows the refactor commit
- `OrderSlideOver.tsx` contains `import { OrderItems }` and `<OrderItems` usage
- `OrderSlideOver.tsx` does NOT contain `formatCurrency` import or hand-rolled items map block
</verification>

<success_criteria>
- Build and type-check pass with no errors
- OrderSlideOver delegates items+pricing rendering to OrderItems
- Delivery fee input (from quick-18) is now visible in the slide-over panel
- Change committed on the phase-19 branch
</success_criteria>

<output>
No SUMMARY.md required for quick tasks. STATE.md quick task table should be updated to record this entry after completion.
</output>
