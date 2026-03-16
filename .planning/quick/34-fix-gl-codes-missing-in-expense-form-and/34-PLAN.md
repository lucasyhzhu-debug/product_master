---
phase: quick-34
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/pages/ExpenseSubmit.tsx
autonomous: false
requirements:
  - QT-34-BUG
  - QT-34-UX
must_haves:
  truths:
    - "GL Category dropdown shows accounts after seeding (not empty)"
    - "User selects Expense Type first (COGS, Operating Expenses, Other Income/Expense)"
    - "GL Account dropdown filters to only accounts matching selected Expense Type"
    - "Changing Expense Type resets GL Account selection"
    - "accountId (the GL account _id) is the value submitted with the form"
    - "Edit mode pre-fills both Tier 1 and Tier 2 from existing accountId"
  artifacts:
    - path: "src/pages/ExpenseSubmit.tsx"
      provides: "Cascading Tier 1 -> Tier 2 GL account selection"
      contains: "expenseType"
  key_links:
    - from: "src/pages/ExpenseSubmit.tsx"
      to: "useAccounts(true)"
      via: "accounts query filtered by type field"
      pattern: "accounts.*filter.*expenseType"
---

<objective>
Fix empty GL Category dropdown (accounts table not seeded) and replace the flat GL account selector with cascading Tier 1 (Expense Type) -> Tier 2 (GL Account) dropdowns for better UX.

Purpose: Users cannot submit expenses because the GL Category dropdown is empty. After seeding, a flat list of 18 accounts is hard to navigate. Cascading dropdowns group accounts by category for faster selection.

Output: Updated ExpenseSubmit.tsx with cascading dropdowns; manual seed step documented.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/pages/ExpenseSubmit.tsx
@src/hooks/convex/useAccounts.ts
@convex/accounts/mutations.ts
@convex/accounts/queries.ts

<interfaces>
<!-- Account type from useAccounts hook -->
From src/hooks/convex/useAccounts.ts:
```typescript
export type Account = NonNullable<ReturnType<typeof useAccounts>>[number];
// Each account has: _id, code, name, type, category, isActive, isSystem
// type is one of: "asset" | "liability" | "equity" | "revenue" | "cogs" | "opex" | "other"
// category is the human-readable label: "Cost of Goods Sold", "Operating Expenses", "Other Income/Expense"
```

From convex/schema.ts (accounts table):
```typescript
accounts: defineTable({
  code: v.string(),        // "5100", "6100", etc.
  name: v.string(),        // "Production COGS", "Salaries & Wages"
  type: v.union(v.literal("asset"), v.literal("liability"), v.literal("equity"),
                v.literal("revenue"), v.literal("cogs"), v.literal("opex"), v.literal("other")),
  category: v.string(),    // "Cost of Goods Sold", "Operating Expenses", "Other Income/Expense"
  isActive: v.boolean(),
  isSystem: v.boolean(),
  description: v.optional(v.string()),
})
```

Expense-relevant account types (after filter on line 90-92 of ExpenseSubmit.tsx):
- type "cogs" -> category "Cost of Goods Sold" (4 accounts: 5100-5400)
- type "opex" -> category "Operating Expenses" (11 accounts: 6100-6990)
- type "other" -> category "Other Income/Expense" (3 accounts: 7100-7900)
</interfaces>
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Seed GL accounts in Convex dashboard</name>
  <files>convex/accounts/mutations.ts</files>
  <action>
    The `accounts:seedDefaults` mutation already exists in convex/accounts/mutations.ts. It upserts 39 PSAK-aligned GL accounts. The expense form dropdown is empty because this mutation was never run against the dev environment. This is a manual step -- run it from the Convex dashboard.
  </action>
  <verify>Open Convex dashboard Data tab -> accounts table and confirm 39 rows exist</verify>
  <done>accounts table contains 39 seeded GL accounts in both dev and production environments</done>
  <what-built>The `accounts:seedDefaults` mutation already exists and will upsert 39 PSAK-aligned GL accounts. The expense form dropdown is empty because this mutation was never run.</what-built>
  <how-to-verify>
    1. Open Convex dashboard: run `npx convex dashboard` or visit https://dashboard.convex.dev
    2. Go to the Functions tab
    3. Find and run `accounts:seedDefaults` (no arguments needed, leave token empty)
    4. Verify it returns 39 results with action "created"
    5. Go to Data tab -> accounts table and confirm 39 rows exist
    6. Repeat for production environment if needed (switch deployment in dashboard)
  </how-to-verify>
  <resume-signal>Type "seeded" when accounts:seedDefaults has been run successfully</resume-signal>
</task>

<task type="auto">
  <name>Task 2: Replace flat GL dropdown with cascading Tier 1 / Tier 2 selects</name>
  <files>src/pages/ExpenseSubmit.tsx</files>
  <action>
Replace the single "GL Category" Select (lines 343-361) with two cascading dropdowns:

1. Add a new `expenseType` field to `FormState` (type: `string`, default: `""`). This holds the Tier 1 selection (`"cogs"`, `"opex"`, or `"other"`).

2. Define a constant `EXPENSE_TYPE_OPTIONS` mapping Tier 1 values to labels:
   ```
   { value: "cogs", label: "Cost of Goods Sold" }
   { value: "opex", label: "Operating Expenses" }
   { value: "other", label: "Other Income/Expense" }
   ```

3. Derive `filteredAccounts` using `useMemo`: filter `accounts` array by `a.type === form.expenseType`. Returns empty array if no expenseType selected.

4. Replace the single Select block (lines 343-361) with two Selects in a 2-column grid (`grid grid-cols-1 sm:grid-cols-2 gap-4`):

   **Tier 1 "Expense Type"** (left column):
   - Label: "Expense Type *"
   - Placeholder: "Select type..."
   - Items from `EXPENSE_TYPE_OPTIONS`
   - `onValueChange`: set `expenseType` AND reset `accountId` to `""` (cascading reset)

   **Tier 2 "GL Account"** (right column):
   - Label: "GL Account *"
   - Placeholder: "Select account..."
   - Items from `filteredAccounts` (show `{code} - {name}`)
   - Disabled when `!form.expenseType` (no Tier 1 selected)
   - Value: `form.accountId` (this is the actual form value submitted)

5. Update `validateForm`: change the "GL Category is required" check to validate BOTH `form.expenseType` ("Expense Type is required") AND `form.accountId` ("GL Account is required").

6. Update the edit-mode `useEffect` (lines 110-135): when pre-filling from `existingExpense`, derive `expenseType` from the loaded accounts list:
   ```
   const matchedAccount = accounts?.find(a => a._id === existingExpense.accountId);
   expenseType: matchedAccount?.type ?? ""
   ```
   Note: `accounts` may still be loading when the effect runs. Add `accounts` to the dependency array and only fill when both `existingExpense` and `accounts` are available.

7. Do NOT change `buildArgs()` -- it already uses `form.accountId` which is exactly what the backend expects. The `expenseType` field is UI-only state, not persisted.

8. Add `useMemo` to the imports from React (line 1) if not already present.
  </action>
  <verify>
    <automated>cd "D:/Claude/Product Manager/product_master" && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>
    - Two cascading dropdowns render: "Expense Type" and "GL Account"
    - Selecting an Expense Type filters GL Account options to that type only
    - Changing Expense Type clears GL Account selection
    - GL Account dropdown is disabled until Expense Type is selected
    - Edit mode correctly pre-fills both dropdowns from the existing accountId
    - Form validation requires both fields
    - TypeScript compiles with no errors
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes (no type errors)
2. `npm run build` succeeds
3. Manual verification: visit /expenses/new, confirm Expense Type dropdown shows 3 options, selecting one filters GL Account dropdown
</verification>

<success_criteria>
- accounts table contains 39 seeded GL accounts (manual step)
- ExpenseSubmit.tsx has cascading Tier 1 (Expense Type) -> Tier 2 (GL Account) dropdowns
- Tier 2 filters by selected Tier 1 type and resets on Tier 1 change
- Edit mode pre-fills both tiers from existing accountId
- `npm run build` passes
</success_criteria>

<output>
After completion, create `.planning/quick/34-fix-gl-codes-missing-in-expense-form-and/34-SUMMARY.md`
</output>
