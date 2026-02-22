---
phase: quick-13
plan: 13
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/layout/Header.tsx
  - src/components/orders/OrderForm.tsx
autonomous: true
requirements:
  - QUICK-13
must_haves:
  truths:
    - "Managers can reach the Customers CRUD page from the Config nav dropdown"
    - "When an existing customer is selected in OrderForm, their phone number is shown inline"
    - "User can edit and save the selected customer's phone number without leaving the order form"
    - "Phone update persists to the customer record (calls customers.mutations.update)"
  artifacts:
    - path: "src/components/layout/Header.tsx"
      provides: "Customers link in configItems nav array"
    - path: "src/components/orders/OrderForm.tsx"
      provides: "Inline phone display and edit for selected existing customer"
  key_links:
    - from: "OrderForm.tsx"
      to: "convex/customers/mutations.ts update"
      via: "useConvexUpdateCustomer hook"
      pattern: "useConvexUpdateCustomer"
---

<objective>
Add two UX improvements:
1. Surface the existing CustomersManager page in the Config nav so managers can access it from the header.
2. When selecting an existing customer in the new order form, show their current phone number inline with a small edit button — clicking edit reveals an input that saves via the update mutation on blur or Enter.

Purpose: Managers need quick access to customer records, and order staff need to update customer phone numbers at the point of capture without navigating away.
Output: Updated Header.tsx (1 new configItems entry) and OrderForm.tsx (phone inline edit when existing customer selected).
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
  <name>Task 1: Add Customers to Config nav in Header</name>
  <files>src/components/layout/Header.tsx</files>
  <action>
In `src/components/layout/Header.tsx`, add a new entry to the `configItems` array for the Customers page.

Current configItems (lines ~78-81):
```ts
const configItems: NavItem[] = [
  { path: '/components/production', label: 'Production', icon: Circle, permission: 'canAccessInventory' },
  { path: '/whatsapp-templates', label: 'WhatsApp', icon: MessageSquare, permission: 'canManageWhatsAppTemplates' },
];
```

Add after the existing entries:
```ts
  { path: '/customers', label: 'Customers', icon: Users, permission: 'canAccessOrders' },
```

The `Users` icon is already imported (used in adminItems). The permission `canAccessOrders` matches the existing ProtectedRoute on the `/customers` route in App.tsx, giving access to order_staff, manager, and admin roles.

No other changes needed in this file.
  </action>
  <verify>Run `npm run type-check` — should pass with no errors. Visually confirm "Customers" appears in the Config dropdown for manager/admin roles.</verify>
  <done>Customers entry appears in the Config nav dropdown and navigates to /customers (CustomersManager page).</done>
</task>

<task type="auto">
  <name>Task 2: Inline phone display and edit for selected existing customer in OrderForm</name>
  <files>src/components/orders/OrderForm.tsx</files>
  <action>
In `src/components/orders/OrderForm.tsx`, when an existing customer has been selected (`customerId` is set, `isNewCustomer` is false), show their phone number inline below the customer search input with an edit affordance.

Steps:

1. Add imports at top of file:
   - `useConvexCustomer` from `@/hooks/convex/useCustomers` (already exported there)
   - `useConvexUpdateCustomer` from `@/hooks/convex/useCustomers` (already exported there)
   - `Pencil`, `Check` icons from `lucide-react` (add to existing lucide import)

2. Add new state variables (after existing state declarations):
   ```ts
   const [editingPhone, setEditingPhone] = useState(false);
   const [phoneEdit, setPhoneEdit] = useState('');
   ```

3. Add hooks (after existing hooks, before any conditional logic):
   ```ts
   const selectedCustomer = useConvexCustomer(customerId ?? undefined);
   const updateCustomer = useConvexUpdateCustomer();
   ```

4. Add a `handleSavePhone` async function:
   ```ts
   const handleSavePhone = async () => {
     if (!customerId) return;
     await updateCustomer.mutateAsync({ id: customerId, phone: phoneEdit || undefined });
     setEditingPhone(false);
   };
   ```

5. In the JSX, inside the `!isNewCustomer` branch, after the existing customer search `<Input>` and dropdown `div` (i.e., after the closing `</div>` of the `relative` wrapper, around line 431), add the phone display/edit row. Show it only when `customerId` is set (customer has been selected):

   ```tsx
   {customerId && (
     <div className="flex items-center gap-2 mt-1.5">
       {editingPhone ? (
         <>
           <Input
             autoFocus
             value={phoneEdit}
             onChange={(e) => setPhoneEdit(e.target.value)}
             onKeyDown={(e) => {
               if (e.key === 'Enter') handleSavePhone();
               if (e.key === 'Escape') setEditingPhone(false);
             }}
             placeholder="Phone number"
             className="h-8 text-sm flex-1"
           />
           <Button
             type="button"
             size="icon"
             variant="ghost"
             className="h-8 w-8 shrink-0"
             onClick={handleSavePhone}
             disabled={updateCustomer.isPending}
           >
             <Check className="h-3.5 w-3.5" />
           </Button>
         </>
       ) : (
         <>
           <span className="text-sm text-muted-foreground flex-1">
             {selectedCustomer?.phone
               ? `Phone: ${selectedCustomer.phone}`
               : 'No phone on record'}
           </span>
           <Button
             type="button"
             size="icon"
             variant="ghost"
             className="h-7 w-7 shrink-0"
             onClick={() => {
               setPhoneEdit(selectedCustomer?.phone ?? '');
               setEditingPhone(true);
             }}
           >
             <Pencil className="h-3 w-3" />
           </Button>
         </>
       )}
     </div>
   )}
   ```

6. When the customer selection is cleared (in `handleCreateNewCustomer` and the X button onClick), also reset phone edit state:
   ```ts
   setEditingPhone(false);
   setPhoneEdit('');
   ```

7. Also reset in `handleCustomerSelect` when a new customer is selected:
   ```ts
   setEditingPhone(false);
   setPhoneEdit('');
   ```

Note: `useConvexCustomer` returns `undefined` while loading and `null` if not found — handle gracefully by checking `selectedCustomer?.phone`. The `useConvexUpdateCustomer` hook already shows a success toast on save (configured in useCustomers.ts).
  </action>
  <verify>
Run `npm run type-check` — must pass.
Manual test: Create new order, search and select a customer, observe phone shown inline. Click pencil, edit phone, press Enter or check — verify toast "Customer updated" appears. Deselect customer, reselect — new phone should appear.
  </verify>
  <done>
When an existing customer is selected in the order form: their phone (or "No phone on record") is shown with a pencil icon. Clicking pencil reveals an input pre-filled with current phone. Saving calls update mutation and shows success toast. Type-check passes.
  </done>
</task>

</tasks>

<verification>
- `npm run type-check` passes with no errors
- `npm run build` passes
- Customers appears in Config dropdown for manager/admin
- Phone inline edit works in OrderForm for selected existing customers
</verification>

<success_criteria>
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] Customers link visible in Config nav dropdown for manager/admin roles
- [ ] Selecting existing customer in OrderForm shows phone inline
- [ ] Phone can be edited inline and saved via update mutation
</success_criteria>

<output>
After completion, create `.planning/quick/13-add-phone-number-editing-in-new-order-fo/13-SUMMARY.md`
</output>
