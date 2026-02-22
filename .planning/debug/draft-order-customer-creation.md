---
status: resolved
trigger: "Creating customers in draft orders doesn't actually create the customer, and when a new customer is added it doesn't automatically apply to the order sheet (user has to search again)."
created: 2026-02-22T00:00:00Z
updated: 2026-02-22T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - Two separate UX/data-flow bugs found and fixed.
test: Traced code flow from CustomerSearch.handleSubmitNew -> OrderCreate.handleNewCustomer -> createDraft mutation
expecting: Root causes confirmed via code reading
next_action: done

## Symptoms

expected: When creating a new customer in a draft order, the customer should be created AND automatically selected/applied to the order. No need to search again.
actual: 1) Creating customers in draft orders doesn't actually create the customer. 2) After adding a new customer, it doesn't auto-apply to the order - user must search for the customer again in the same order creation flow.
errors: No error messages reported - it silently fails or doesn't apply.
reproduction: Go to order creation (OrderCreate.tsx), create a draft order, try to create a new customer from within the order form.
timeline: Unknown when this started.

## Evidence

- timestamp: 2026-02-22T00:00:00Z
  checked: convex/orders/mutations/orderCrud.ts (createDraft mutation)
  found: createDraft DOES insert into customers table when newCustomer is provided (lines 668-676). Returns orderId only -- no customerId returned to frontend.
  implication: Backend customer creation works. The "not created" perception may be because the frontend has no way to set customerId after creation. The draft is created but the frontend state keeps customerId=null, isNewCustomer=true.

- timestamp: 2026-02-22T00:00:00Z
  checked: src/components/orders/CustomerSearch.tsx (handleSubmitNew, lines 60-66)
  found: After calling onNewCustomer(), calls setSelected(null) -- this CLEARS the selected display state, causing the search bar to reappear empty.
  implication: Bug 2 root cause. CustomerSearch drops to empty search state instead of showing the new customer. User sees empty search bar and thinks no customer was set.

- timestamp: 2026-02-22T00:00:00Z
  checked: src/pages/OrderCreate.tsx (handleNewCustomer, lines 219-240)
  found: Sets customerId=null (explicitly!), customerName, customerPhone, isNewCustomer=true, customerSet=true. Calls createDraftMutation. Old return was just orderId.
  implication: After createDraft returns orderId only, the frontend cannot set the real customerId. OrderCreate kept isNewCustomer=true and customerId=null, which works for submission fallback but breaks state integrity.

- timestamp: 2026-02-22T00:00:00Z
  checked: CustomerSearch selected state type
  found: selected: { id: Id<"customers">; name: string; phone?: string } | null -- requires an ID.
  implication: Needed to relax ID to optional (null) to allow displaying new customers before we have their ID confirmed.

- timestamp: 2026-02-22T00:00:00Z
  checked: OrderCreate render logic (lines 528-538)
  found: Static customer display only shows in isEditMode && customerSet. In new order mode, CustomerSearch is always rendered.
  implication: Even when customerSet=true in new order flow, the CustomerSearch component continues to render -- so it must handle its own "selected" display state correctly.

## Eliminated

- hypothesis: Backend customer creation is broken (mutation not called or failing silently)
  evidence: createDraft mutation correctly handles newCustomer and inserts into customers table. OrderCreate.handleNewCustomer correctly calls createDraftMutation with newCustomer object. The customer IS created in the DB.
  timestamp: 2026-02-22T00:00:00Z

## Resolution

root_cause: |
  TWO root causes:

  1. BUG 1 (customer not properly tracked): createDraft mutation returned only orderId. When a new
     customer was created via the draft, the frontend had no way to get the customerId back. This
     left customerId=null and isNewCustomer=true in OrderCreate state indefinitely. The customer IS
     created in the DB but the frontend state was inconsistent (no real ID).

  2. BUG 2 (doesn't auto-apply to UI): CustomerSearch.handleSubmitNew called setSelected(null) after
     invoking onNewCustomer(). This immediately reset the UI to the empty search bar state. The user
     sees an empty search field and thinks no customer was selected, so they search again.

fix: |
  Fix 1: Modified createDraft mutation to return { orderId, customerId } instead of just orderId.
  This allows the frontend to receive the real customer ID after a new customer is created.

  Fix 2: Modified handleNewCustomer in OrderCreate to:
  - Be async and return Promise<Id<"customers"> | undefined>
  - Extract customerId from createDraft result and call setCustomerId(result.customerId)
  - Set isNewCustomer=false (customer now has a real ID)
  - Return the customerId to the caller (CustomerSearch)

  Fix 3: Modified CustomerSearch:
  - onNewCustomer prop changed to async: (name, phone) => Promise<Id<"customers"> | undefined>
  - selected state type relaxed to { id: Id<"customers"> | null; name: string; phone?: string }
  - handleSubmitNew awaits onNewCustomer, then calls setSelected({ id: customerId ?? null, name, phone })
    so the "selected customer chip" displays immediately after creation

verification: npm run build passes with zero TypeScript errors
files_changed:
  - convex/orders/mutations/orderCrud.ts (createDraft returns { orderId, customerId })
  - src/components/orders/CustomerSearch.tsx (onNewCustomer async, selected id optional, handleSubmitNew shows chip)
  - src/pages/OrderCreate.tsx (handleNewCustomer async, returns customerId, sets real customerId state)
