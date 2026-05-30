---
phase: 73
plan: 04
type: execute
wave: 4
depends_on: [01, 02, 03]
files_modified:
  - convex/bankStatements/mutations.ts
  - convex/bankStatements/__tests__/mutations.test.ts
  - convex/expenses/__tests__/inlineFromBank.test.ts
  - src/hooks/convex/useBankReconciliation.ts
  - src/pages/ExpenseSubmit.tsx
  - src/pages/AssetRegister.tsx
  - src/components/expenses/ExpenseForm.tsx
  - src/components/bankReconciliation/inline-create/CreateExpenseFromLineDialog.tsx
  - src/components/bankReconciliation/inline-create/CreateRevenueFromLineDialog.tsx
  - src/components/bankReconciliation/inline-create/CreateReimbursementFromLineDialog.tsx
  - src/components/bankReconciliation/BankLinesPane.tsx
  - src/components/bankReconciliation/ReviewWorkspace.tsx
  - src/components/bankReconciliation/__tests__/CreateExpenseFromLineDialog.test.tsx
  - src/components/bankReconciliation/__tests__/CapExHandoff.test.tsx
autonomous: true
requirements: [BANK-03]
tags: [bank-reconciliation, inline-create, capex-handoff, expense-form, asset-register]

must_haves:
  truths:
    - "Unmatched debit line has Create expense button that opens a dialog pre-filled with date, amount, description, vendorName from the bank line"
    - "Create expense dialog REQUIRES submittedBy (owner picker) and receiptFile upload before save — cannot be skipped"
    - "Inline-created expense routes through standard expense submission flow (status=submitted, NOT approved); bank line auto-matches but stays suggested"
    - "Unmatched credit line has Create revenue button opening externalRevenue creation dialog pre-filled with transactionDate + revenueGross + source"
    - "Unmatched debit line has Create reimbursement batch button opening batch creation dialog pre-filled with totalAmount + createdAt"
    - "CapEx-flagged line (flags contains capex_needs_asset_register) replaces Confirm button with Route to Asset Register button"
    - "Route to Asset Register navigates to /asset-register/new with URL params: fromBankLineId, date, cost, vendor, description"
    - "AssetRegister new-intake reads bank-line URL params and pre-fills the form; on save, bank line auto-matches to the new asset's acquisition expense"
    - "Existing asset detection: if vendor + cost + purchaseDate match within ±3 days, intake form surfaces Link to existing? prompt before creating duplicate"
    - "Inline expense form is extracted from ExpenseSubmit into a reusable ExpenseForm component (no behavior regression on /expenses/new)"
  artifacts:
    - path: src/components/expenses/ExpenseForm.tsx
      provides: "Reusable pure form component extracted from ExpenseSubmit — used by both ExpenseSubmit page and CreateExpenseFromLineDialog"
      exports: ["ExpenseForm"]
    - path: src/components/bankReconciliation/inline-create/CreateExpenseFromLineDialog.tsx
      provides: "D-17 inline expense creation via standard submission flow"
    - path: src/components/bankReconciliation/inline-create/CreateRevenueFromLineDialog.tsx
      provides: "D-18 inline externalRevenue creation"
    - path: src/components/bankReconciliation/inline-create/CreateReimbursementFromLineDialog.tsx
      provides: "D-19 inline reimbursement batch creation"
    - path: src/pages/AssetRegister.tsx
      provides: "CapEx intake pre-fill from URL params; existing-asset detection"
      contains: "fromBankLineId"
    - path: convex/bankStatements/mutations.ts
      provides: "linkInlineExpense / linkInlineRevenue / linkInlineReimbursement mutations OR updated manualMatch path to set createdExpenseId/createdRevenueId/createdReimbursementId"
  key_links:
    - from: "src/components/bankReconciliation/inline-create/CreateExpenseFromLineDialog.tsx"
      to: "convex/expenses/mutations.ts submitExpense (via existing useSubmitExpense hook)"
      via: "standard submission path — NOT a direct status=approved shortcut"
      pattern: "useSubmitExpense|submitExpense"
    - from: "BankLinesPane CapEx badge → Route button"
      to: "/asset-register/new?fromBankLineId=...&cost=...&vendor=...&date=...&description=..."
      via: "react-router useNavigate with URL params"
      pattern: "asset-register/new.*fromBankLineId"
    - from: "AssetRegister intake save"
      to: "bankStatementLines auto-match (matchedType=expense, matchedId=acquisitionExpenseId, createdExpenseId=...)"
      via: "asset-create mutation chains to bank-line linking mutation"
      pattern: "linkBankLineToExpense|createdExpenseId"
---

<objective>
Wire up the two remaining reconciliation flows: inline record creation (expense, revenue, reimbursement) from unmatched bank lines, and CapEx handoff to the Asset Register. The inline expense path is the critical user-flagged constraint — it MUST route through the standard expense submission flow (status=submitted, receipt required, submittedBy required), preserving separation-of-duties even though the money already left the bank.

Purpose: Implements D-16 (inline creation for all three types), D-17 (critical expense-submission flow preservation), D-18, D-19 (revenue + reimbursement inline), D-20, D-21, D-22 (CapEx routing + existing-asset detection).

Output: From an unmatched bank line a reviewer can (a) create an expense (opens form dialog with pre-fill, requires submittedBy + receipt, saves via standard submitExpense path, auto-links the bank line); (b) create a revenue row (opens externalRevenue dialog); (c) create a reimbursement batch. For CapEx-flagged lines, `[Route to Asset Register]` replaces `[Confirm]` and routes to AssetRegister's new-intake with URL params; on asset save the bank line auto-matches to the asset's acquisition expense. An existing-asset detection (vendor + cost + date) prevents duplicates.
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/execute-plan.md
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/73-bank-reconciliation-ui-workflow/73-CONTEXT.md
@.planning/phases/73-bank-reconciliation-ui-workflow/73-UI-SPEC.md
@.planning/phases/73-bank-reconciliation-ui-workflow/73-RESEARCH.md
@.planning/phases/73-bank-reconciliation-ui-workflow/73-01-SUMMARY.md
@.planning/phases/73-bank-reconciliation-ui-workflow/73-02-SUMMARY.md
@.planning/phases/73-bank-reconciliation-ui-workflow/73-03-SUMMARY.md
@src/pages/ExpenseSubmit.tsx
@src/pages/AssetRegister.tsx
@src/hooks/convex/useExpenses.ts
@src/hooks/convex/useExternalRevenue.ts
@src/hooks/convex/useReimbursements.ts
@src/hooks/convex/useFixedAssets.ts
@src/hooks/convex/useBankReconciliation.ts
@convex/expenses/mutations.ts
@convex/externalRevenue/mutations.ts
@convex/reimbursementBatches/mutations.ts
@convex/fixedAssets/mutations.ts
@convex/bankStatements/mutations.ts
@src/components/bankReconciliation/BankLinesPane.tsx
@src/components/bankReconciliation/ReviewWorkspace.tsx

<interfaces>
From Plan 1 schema (bankStatementLines D-25):
```typescript
createdExpenseId?: Id<"expenses">
createdRevenueId?: Id<"externalRevenue">
createdReimbursementId?: Id<"reimbursementBatches">
```

From existing convex/expenses/mutations.ts (per RESEARCH):
```typescript
// Standard submission flow — two-step:
createDraft({ token, ...expenseFields }) → Id<"expenses"> (status="draft")
submitExpense({ token, expenseId }) → { ok: true } (status becomes "submitted")
// NEVER use: approveExpense / directly set status="approved"
```

From src/pages/ExpenseSubmit.tsx (form fields — extract into ExpenseForm):
- date, amount, vendorName, accountId (category), description, receiptFile, submittedBy, ...
- Form lives inside the page; Plan 4 Task 1 extracts it into `src/components/expenses/ExpenseForm.tsx` with props `{ initialValues, onSubmit, submitLabel, forceFields?: { receiptRequired: true, submittedByRequired: true } }`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract ExpenseForm + build CreateExpenseFromLineDialog (D-17 critical path)</name>
  <files>
    src/components/expenses/ExpenseForm.tsx,
    src/pages/ExpenseSubmit.tsx,
    src/components/bankReconciliation/inline-create/CreateExpenseFromLineDialog.tsx,
    src/components/bankReconciliation/BankLinesPane.tsx,
    src/components/bankReconciliation/ReviewWorkspace.tsx,
    src/hooks/convex/useBankReconciliation.ts,
    convex/bankStatements/mutations.ts,
    convex/bankStatements/__tests__/mutations.test.ts,
    convex/expenses/__tests__/inlineFromBank.test.ts,
    src/components/bankReconciliation/__tests__/CreateExpenseFromLineDialog.test.tsx
  </files>
  <read_first>
    src/pages/ExpenseSubmit.tsx (ENTIRE file — understand form state, validation, submit path),
    src/hooks/convex/useExpenses.ts (useCreateExpenseDraft + useSubmitExpense hooks),
    convex/expenses/mutations.ts (createDraft + submitExpense contracts),
    src/components/bankReconciliation/BankLinesPane.tsx (Plan 3 output — where Create expense button attaches),
    src/components/bankReconciliation/ReviewWorkspace.tsx (Plan 3 output),
    src/components/ui/dialog.tsx + sheet.tsx (modal/sheet primitives),
    .planning/phases/73-bank-reconciliation-ui-workflow/73-CONTEXT.md D-17 (CRITICAL — exact constraint language, "the person managing the matching may not be the person that ordered the bank debit..."),
    .planning/phases/73-bank-reconciliation-ui-workflow/73-UI-SPEC.md Copy lines 99, 124-125 (inline create copy + warning pre-save)
  </read_first>
  <behavior>
    **`ExpenseForm.tsx` extraction:**
    - Move all form state, validation, and field rendering from ExpenseSubmit.tsx into a new `src/components/expenses/ExpenseForm.tsx`.
    - Props: `{ initialValues: Partial<ExpenseFormValues>, onSubmit(values, { asDraft }): Promise<void>, forceFields?: { receiptRequired?: boolean, submittedByRequired?: boolean }, mode: "page" | "dialog" }`.
    - `forceFields` makes the named fields required even if the default form would allow draft-without-receipt; `mode: "dialog"` removes page chrome.
    - ExpenseSubmit.tsx is refactored to render `<ExpenseForm mode="page" initialValues={...} onSubmit={...} />` with identical behavior. Existing tests / flows must continue to work.

    **Bank-line link mutation (server):**
    - Add `linkInlineExpense({ token, lineId, expenseId })` mutation on `convex/bankStatements/mutations.ts`. requireRole manager+admin. Validates expense exists. Patches bank line: matchedType="expense", matchedId=expenseId, matchMethod="linked_to_record", createdExpenseId=expenseId, isAutoMatched=false. Status stays "suggested" (NOT confirmed) per D-17. Throws if line already confirmed.
    - Add parallel `linkInlineRevenue({ token, lineId, revenueId })` and `linkInlineReimbursement({ token, lineId, reimbursementBatchId })` mutations (used by Task 2 dialogs).

    **`CreateExpenseFromLineDialog.tsx` (NEW):**
    - Props: `{ open, onOpenChange, bankLine }`.
    - On open, pre-fill initial values from bank line:
      - `date = bankLine.date` (WIB)
      - `amount = bankLine.amountIdr`
      - `description = bankLine.rawDescription`
      - `vendorName = bankLine.parsedCounterparty ?? ""`
      - `accountId = bankLine.overrideCategoryAccountId ?? bankLine.jeDebitAccountId` (bank line's suggested category if present)
      - `submittedBy = ""` (MUST be filled)
      - `receiptFile = null` (MUST be uploaded)
    - Renders `<ExpenseForm mode="dialog" initialValues={...} forceFields={{ receiptRequired: true, submittedByRequired: true }} onSubmit={handleSubmit} />`.
    - Above the form, display a warning banner with UI-SPEC copy: `This expense will be submitted (not auto-approved) and the bank line stays "suggested" until a manager approves it.`
    - `handleSubmit`:
      1. `createDraft(values)` → newExpenseId
      2. `submitExpense({ expenseId: newExpenseId })` → status=submitted
      3. `linkInlineExpense({ lineId: bankLine._id, expenseId: newExpenseId })` → bank line auto-matches, status="suggested"
      4. Toast success: `Line matched to expense.` (or a composite copy). Close dialog.
    - Failure handling: if step 2 or 3 fails after step 1 created a draft, surface the error; leave the draft in place for the user to retry.

    **Wire into BankLinesPane:**
    - For unmatched debit lines, add `[Create expense from this line]` button (UI-SPEC Primary CTA copy). Also add `[Create reimbursement batch from this line]` (Task 2 handler). For credit lines, Task 2 adds `[Create revenue from this line]`.

    **`useBankReconciliation.ts`:** add `useLinkInlineExpense`, `useLinkInlineRevenue`, `useLinkInlineReimbursement` hooks (manager+admin via session token).

    **Tests:**
    - `convex/bankStatements/__tests__/mutations.test.ts`: extend with `linkInlineExpense` cases — (a) patches fields correctly, (b) sets status to "suggested" (NOT confirmed), (c) rejects confirmed lines, (d) rejects kitchen/order_staff.
    - `convex/expenses/__tests__/inlineFromBank.test.ts` (NEW): integration test using convex-test that:
      1. Seeds a bank line (debit, unmatched)
      2. Calls `createDraft` + `submitExpense` + `linkInlineExpense` in sequence
      3. Asserts resulting expense has `status="submitted"` (not approved), `receiptUrl` present
      4. Asserts bank line patched: `matchedType="expense"`, `matchedId` set, `createdExpenseId` set, `status="suggested"`
    - `CreateExpenseFromLineDialog.test.tsx`: render with sample bankLine, assert:
      - Receipt upload field rendered as required (aria-required or required attr)
      - submittedBy picker rendered
      - Submit calls createDraft + submitExpense + linkInlineExpense in correct order (mock hooks, assert call sequence)
      - Warning banner copy present verbatim
      - Form cannot submit without receipt OR without submittedBy (validation blocks)
  </behavior>
  <action>
    1. Extract form from ExpenseSubmit into ExpenseForm.tsx.
    2. Refactor ExpenseSubmit.tsx to use ExpenseForm (behavior must match prior page).
    3. Add 3 link mutations to `convex/bankStatements/mutations.ts`; update reconcileHelpers if any logic shared.
    4. Append 3 hooks to useBankReconciliation.ts.
    5. Create CreateExpenseFromLineDialog.tsx.
    6. Wire Create expense button into BankLinesPane for unmatched debit lines.
    7. Write integration test (convex/expenses/__tests__/inlineFromBank.test.ts).
    8. Write component test (CreateExpenseFromLineDialog.test.tsx).
    9. Run tests + build. Regression-check: ExpenseSubmit page still works as before.
  </action>
  <verify>
    <automated>npm run test -- --run convex/bankStatements/__tests__/mutations.test.ts convex/expenses/__tests__/inlineFromBank.test.ts src/components/bankReconciliation/__tests__/CreateExpenseFromLineDialog.test.tsx &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `src/components/expenses/ExpenseForm.tsx` exists and exports `ExpenseForm`
    - `grep -n "ExpenseForm" src/pages/ExpenseSubmit.tsx` returns at least 1 match (page uses extracted form)
    - `grep -n "export const linkInlineExpense" convex/bankStatements/mutations.ts` returns 1 match
    - `grep -n "export const linkInlineRevenue" convex/bankStatements/mutations.ts` returns 1 match
    - `grep -n "export const linkInlineReimbursement" convex/bankStatements/mutations.ts` returns 1 match
    - `grep -n "createdExpenseId" convex/bankStatements/mutations.ts` returns at least 1 match (linkInlineExpense sets it)
    - `src/components/bankReconciliation/inline-create/CreateExpenseFromLineDialog.tsx` exists
    - `grep -n "useSubmitExpense\\|submitExpense" src/components/bankReconciliation/inline-create/CreateExpenseFromLineDialog.tsx` returns at least 1 match (uses standard submission path)
    - `grep -nE "receiptRequired.*true" src/components/bankReconciliation/inline-create/CreateExpenseFromLineDialog.tsx` returns at least 1 match
    - `grep -nE "submittedByRequired.*true" src/components/bankReconciliation/inline-create/CreateExpenseFromLineDialog.tsx` returns at least 1 match
    - `grep -n "This expense will be submitted" src/components/bankReconciliation/inline-create/CreateExpenseFromLineDialog.tsx` returns 1 match (warning banner)
    - `grep -n "Create expense from this line" src/components/bankReconciliation/BankLinesPane.tsx` returns 1 match (button trigger)
    - `grep -nE "status.*approved" src/components/bankReconciliation/inline-create/CreateExpenseFromLineDialog.tsx` returns 0 matches (CRITICAL: no auto-approval shortcut)
    - `convex/expenses/__tests__/inlineFromBank.test.ts` exists and passes
    - `npm run test -- --run convex/expenses/__tests__/inlineFromBank.test.ts` exits 0
    - `npm run test -- --run src/components/bankReconciliation/__tests__/CreateExpenseFromLineDialog.test.tsx` exits 0
    - `npm run build` exits 0
  </acceptance_criteria>
  <done>ExpenseForm extracted, ExpenseSubmit page regression-clean; inline expense creation from bank line routes through standard submission (status=submitted, receipt required, submittedBy required — enforced in UI and verified by integration test); bank line auto-matches with status=suggested per D-17; 3 link mutations shipped; all tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Inline revenue + reimbursement dialogs + CapEx handoff to Asset Register</name>
  <files>
    src/components/bankReconciliation/inline-create/CreateRevenueFromLineDialog.tsx,
    src/components/bankReconciliation/inline-create/CreateReimbursementFromLineDialog.tsx,
    src/components/bankReconciliation/BankLinesPane.tsx,
    src/components/bankReconciliation/ReviewWorkspace.tsx,
    src/pages/AssetRegister.tsx,
    convex/fixedAssets/mutations.ts,
    convex/bankStatements/mutations.ts,
    src/components/bankReconciliation/__tests__/CapExHandoff.test.tsx
  </files>
  <read_first>
    src/components/bankReconciliation/BankLinesPane.tsx (Plan 3 + Task 1 output — where buttons attach),
    src/pages/AssetRegister.tsx (ENTIRE file — current intake form, understand how to add URL param pre-fill + existing-asset detection),
    src/hooks/convex/useExternalRevenue.ts (createExternalRevenue mutation hook — or locate equivalent on convex/externalRevenue/mutations.ts),
    src/hooks/convex/useReimbursements.ts (createReimbursementBatch hook),
    src/hooks/convex/useFixedAssets.ts (createAsset hook),
    convex/fixedAssets/mutations.ts (existing asset-create path, understand if a linked acquisition expense is already auto-generated or if we need to chain),
    convex/externalRevenue/mutations.ts + convex/reimbursementBatches/mutations.ts (mutation contracts),
    .planning/phases/73-bank-reconciliation-ui-workflow/73-CONTEXT.md D-18, D-19, D-20, D-21, D-22,
    .planning/phases/73-bank-reconciliation-ui-workflow/73-UI-SPEC.md Copy lines 100-102, 116 (inline revenue/reimbursement/CapEx copy + existing-asset error)
  </read_first>
  <behavior>
    **`CreateRevenueFromLineDialog.tsx`:**
    - Props: `{ open, onOpenChange, bankLine }`.
    - Pre-fill: `transactionDate = bankLine.date`, `revenueGross = bankLine.amountIdr`, `source = bankLine.linkedChannel ?? ""` (if linkedChannel absent, user picks from existing source list via shadcn Select).
    - Render externalRevenue creation fields (source picker, period start/end defaulting to transactionDate, notes).
    - On submit: call existing createExternalRevenue mutation → then call `linkInlineRevenue({ lineId, revenueId })` → toast `Line matched to revenue.` → close.
    - Uses `Create revenue from this line` as Primary CTA (UI-SPEC).

    **`CreateReimbursementFromLineDialog.tsx`:**
    - Props: `{ open, onOpenChange, bankLine }`.
    - Pre-fill: `totalAmount = bankLine.amountIdr`, `createdAt = bankLine.date`.
    - Render reimbursement batch creation form (name, notes, item list — minimal MVP: allow saving an empty batch which user fills in later via the existing ReimbursementManager page if needed). Prefer routing users to the full reimbursement flow if the inline dialog would be too complex — fallback pattern: dialog creates an empty batch with the given totalAmount placeholder, toasts a link to the full flow, auto-matches bank line. Document the UX tradeoff in Summary.
    - On submit: createReimbursementBatch → linkInlineReimbursement → toast → close.
    - CTA: `Create reimbursement batch from this line`.

    **BankLinesPane + ReviewWorkspace wiring:**
    - Debit line + unmatched → show `[Create expense...]` (Task 1) + `[Create reimbursement batch...]`.
    - Credit line + unmatched → show `[Create revenue...]`.
    - CapEx-flagged line (`flags?.includes("capex_needs_asset_register")`) → replace `[Confirm]` button with `[Route to Asset Register]` button (UI-SPEC Primary CTA).
    - `[Route to Asset Register]` click → `navigate('/asset-register/new?fromBankLineId=' + lineId + '&cost=' + amountIdr + '&vendor=' + encodeURIComponent(parsedCounterparty ?? '') + '&date=' + bankLine.date + '&description=' + encodeURIComponent(rawDescription))`.

    **AssetRegister.tsx (extend):**
    - Read URL params `fromBankLineId`, `cost`, `vendor`, `date`, `description` via `useSearchParams`. When `fromBankLineId` present, pre-fill the intake form's corresponding fields.
    - **Existing-asset detection:** On the intake form, once vendor + cost + purchaseDate all present, query existing fixedAssets where `vendor = X` AND `cost BETWEEN X-0 AND X+0` AND `purchaseDate` within ±3 days (use existing hook / new query `findSimilarAssets({ vendor, cost, purchaseDate })` on convex/fixedAssets/queries.ts). If matches found, surface a banner: `An asset matching this vendor, cost, and date is already registered. Link to existing, or continue to create a new one.` with two buttons: `Link to existing` (opens picker) + `Continue new asset`.
    - On save (new asset path): call the existing asset-create mutation. If `fromBankLineId` was present AND the asset-create flow produces an acquisition expense (check existing Phase 60 flow), call `linkInlineExpense({ lineId: fromBankLineId, expenseId: acquisitionExpenseId })` to auto-match the bank line. If the asset flow does NOT create an expense automatically, document in the summary — Plan 5 will handle it as a UAT note.
    - If asset save succeeds and bank line was linked, redirect back to `/bank-reconciliation?tab=review&statementId={statementId from fromBankLineId}` (requires looking up bank line to find statementId, or pass statementId as an extra URL param: `fromBankLineStatementId=...`).

    **Server-side findSimilarAssets query (if missing):**
    - Add `convex/fixedAssets/queries.ts` `findSimilarAssets({ token, vendor, cost, purchaseDate })` with requireRole manager+admin. Simple scan over fixedAssets with filter tolerance.

    **Tests (`CapExHandoff.test.tsx`):**
    - CapEx-flagged line renders `Route to Asset Register` button instead of `Confirm`.
    - Clicking routes via useNavigate with correct URL params (use mock + assert called with expected string).
    - AssetRegister with `?fromBankLineId=X&cost=50000000&vendor=PT+XYZ` pre-fills the intake form.
    - Existing-asset detection: mock findSimilarAssets hook to return 1 match → banner appears with UI-SPEC copy; mock to return [] → banner hidden.
  </behavior>
  <action>
    1. Create CreateRevenueFromLineDialog + CreateReimbursementFromLineDialog.
    2. Wire all 4 inline-create buttons + CapEx Route button into BankLinesPane per the rules above.
    3. Extend AssetRegister.tsx: URL param read + pre-fill + existing-asset detection banner + post-save bank line linking.
    4. Add findSimilarAssets query if not present (small — just a filter over fixedAssets).
    5. If `linkBankLineToExpense` isn't accessible from AssetRegister's save path (different mutation surface), add a thin helper mutation `linkBankLineToAsset({ token, lineId, assetId })` on convex/bankStatements/mutations.ts that looks up the asset's acquisition expense (per Phase 60 convention) and calls linkInlineExpense internally.
    6. Write CapExHandoff.test.tsx.
    7. Run tests + build. Regression-check: AssetRegister intake still works when opened from its normal sidebar link (no URL params).
  </action>
  <verify>
    <automated>npm run test -- --run src/components/bankReconciliation/__tests__/CapExHandoff.test.tsx &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `src/components/bankReconciliation/inline-create/CreateRevenueFromLineDialog.tsx` exists
    - `src/components/bankReconciliation/inline-create/CreateReimbursementFromLineDialog.tsx` exists
    - `grep -n "Create revenue from this line" src/components/bankReconciliation/BankLinesPane.tsx` returns 1 match (credit-line CTA)
    - `grep -n "Create reimbursement batch from this line" src/components/bankReconciliation/BankLinesPane.tsx` returns 1 match (debit-line CTA)
    - `grep -n "Route to Asset Register" src/components/bankReconciliation/BankLinesPane.tsx` returns 1 match (CapEx CTA)
    - `grep -n "capex_needs_asset_register" src/components/bankReconciliation/BankLinesPane.tsx` returns at least 1 match (CapEx flag detection)
    - `grep -n "fromBankLineId" src/pages/AssetRegister.tsx` returns at least 1 match (URL param read)
    - `grep -n "useSearchParams" src/pages/AssetRegister.tsx` returns at least 1 match
    - `grep -n "An asset matching this vendor" src/pages/AssetRegister.tsx` returns 1 match (existing-asset banner copy verbatim from UI-SPEC)
    - `grep -n "linkInlineRevenue" src/components/bankReconciliation/inline-create/CreateRevenueFromLineDialog.tsx` returns at least 1 match
    - `grep -n "linkInlineReimbursement" src/components/bankReconciliation/inline-create/CreateReimbursementFromLineDialog.tsx` returns at least 1 match
    - `npm run test -- --run src/components/bankReconciliation/__tests__/CapExHandoff.test.tsx` exits 0
    - `npm run build` exits 0
  </acceptance_criteria>
  <done>All 3 inline-create dialogs ship and auto-link their bank line on success; CapEx flag replaces Confirm with Route button; AssetRegister reads URL params, pre-fills intake, detects existing assets with ±3d tolerance, and auto-links bank line on save; tests green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CreateExpenseFromLineDialog → expense submission | Inline path MUST use the same createDraft + submitExpense sequence as the standard page — a shortcut that auto-approves violates separation of duties |
| AssetRegister URL params | User-controlled params pre-fill form fields; every field MUST be revalidated by the asset-create mutation server-side |
| linkInlineExpense mutation | Polymorphic matchedId must be validated (IDOR guard) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-73-16 | Elevation | CreateExpenseFromLineDialog auto-approval shortcut | mitigate | Dialog calls `useSubmitExpense` which yields `status="submitted"` NOT `"approved"`; acceptance_criteria grep `status.*approved` returns 0 matches to enforce this at code level; integration test asserts resulting expense.status === "submitted" |
| T-73-17 | Tampering | AssetRegister URL param smuggling (e.g., negative cost, invalid date) | mitigate | Asset-create mutation already validates cost > 0 and purchaseDate > 0 server-side (existing Phase 60 contract); URL params are UI pre-fill convenience only, not trusted |
| T-73-18 | Tampering | linkInlineExpense called with a foreign expenseId | mitigate | Mutation calls `ctx.db.get(expenseId)` and asserts non-null before patching; requireRole gates to manager+admin |
| T-73-19 | Repudiation | Reviewer creates an expense for someone else's submittedBy to hide origin | accept | submittedBy is set by the reviewer at the dialog — this is expected (the reviewer identifies the actual executor); downstream approval audit via existing ExpenseApproval ledger; no additional control needed |
| T-73-20 | Disclosure | findSimilarAssets leaks existence of assets to a manager who isn't the one who recorded them | accept | Manager role is already authorized for asset register (canAccessAssets); no new exposure |
</threat_model>

<verification>
Overall Plan 4 verification:
- `npm run test -- --run convex/expenses/__tests__/inlineFromBank.test.ts src/components/bankReconciliation/__tests__/CreateExpenseFromLineDialog.test.tsx src/components/bankReconciliation/__tests__/CapExHandoff.test.tsx` exits 0
- `npm run type-check` exits 0
- `npm run build` exits 0
- Manual smoke (Plan 5 E2E): from an unmatched debit bank line, create expense inline (fill receipt + submittedBy) → expense shows in ExpenseApproval as "submitted", bank line auto-matched as suggested. From a CapEx-flagged line, Route to Asset Register → form pre-filled → save → bank line auto-linked to asset's acquisition expense.
</verification>

<success_criteria>
- Both tasks meet their acceptance_criteria
- ExpenseForm extracted cleanly; ExpenseSubmit page unchanged in behavior
- Inline expense creation verified NOT to auto-approve (integration + acceptance_criteria grep gate)
- All 3 inline-create buttons present on appropriate unmatched lines
- CapEx Route button replaces Confirm when flag present
- AssetRegister pre-fills from URL params + detects existing assets
- Bank line auto-match happens on every inline-create success path
- Every UI-SPEC CTA / warning / error copy verbatim in components
</success_criteria>

<output>
After completion, create `.planning/phases/73-bank-reconciliation-ui-workflow/73-04-SUMMARY.md` listing:
- ExpenseForm extraction diff
- 3 inline-create dialogs (paths + hook wiring)
- CapEx handoff flow (navigation sequence, URL params, existing-asset detection path)
- Outstanding for Plan 5: E2E smoke test + docs update + UAT manual checks
</output>
