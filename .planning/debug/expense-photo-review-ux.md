---
status: fixing
trigger: "Three expense UX issues: (1) duplicate photo error not user-friendly, (2) approver can't view photos, (3) unclear Void vs Reject for unreimbursed expenses"
created: 2026-03-17T00:00:00Z
updated: 2026-03-17T00:01:00Z
---

## Current Focus

hypothesis: Three confirmed UX gaps with root causes identified in code
test: Code review complete -- all three issues verified
expecting: N/A -- moving to fix phase
next_action: Implement fixes for all three issues

## Symptoms

expected:
  Issue 1 - Duplicate Photo: Smart duplicate detection with confirmation flow and photo reuse
  Issue 2 - Photo Review: Approvers can VIEW receipt photos in review queue
  Issue 3 - Void vs Reject: Clear distinct purposes for unreimbursed expenses

actual:
  Issue 1: Generic error on duplicate photo submission
  Issue 2: "photo uploaded" text shown but no actual photo viewing
  Issue 3: Both options exist but difference unclear

errors: "Duplicate receipt detected. This receipt was already used in expense {expenseNumber}"
reproduction: See symptoms above
started: Since expense system was built (design/UX issues)

## Eliminated

## Evidence

- timestamp: 2026-03-17T00:00:30Z
  checked: convex/expenses/mutations.ts lines 253-267 (FRAUD-02 receipt hash check)
  found: Hard block throws generic Error with text "Duplicate receipt detected. This receipt was already used in expense {expenseNumber}". This is thrown at SUBMIT time (not upload time), so user fills entire form, tries to submit, and gets a blocking error with no option to confirm reuse. The error propagates as a toast via createMutationHook.
  implication: Issue 1 root cause -- user needs: (a) earlier detection at upload/draft-save time, (b) option to confirm they want to share the receipt, (c) the ability to proceed if confirmed.

- timestamp: 2026-03-17T00:00:35Z
  checked: src/pages/ExpenseApproval.tsx lines 192-196 (receipt display in approval queue)
  found: Approval card only shows a Badge with text "Receipt attached" and a Receipt icon when expense.receiptFileId exists. No image preview, no clickable link, no ctx.storage.getUrl() call. The backend query (listPendingForApproval) returns raw expense docs without resolving storage URLs.
  implication: Issue 2 root cause -- two gaps: (a) backend doesn't resolve receiptFileId to a URL, (b) frontend has no image viewer component.

- timestamp: 2026-03-17T00:00:40Z
  checked: src/components/expenses/ApprovalActions.tsx lines 286-337 (Void vs Reject actions)
  found: Void shows for admin on ALL statuses. Reject shows only for submitted expenses. Void dialog says "This will void the expense and create a reversing journal entry if applicable." Reject dialog says "Please provide a reason for rejecting." Neither dialog explains WHEN to use which action. Key semantic difference in backend: Reject (submitted->rejected) = "this expense claim is wrong, submitter should fix and resubmit"; Void (any->voided) = "this expense should not exist, reverse the accounting". But this distinction is not communicated to the user.
  implication: Issue 3 root cause -- missing contextual guidance in dialog descriptions.

- timestamp: 2026-03-17T00:00:45Z
  checked: convex/expenses/helpers.ts lines 69-76 (VOIDABLE_STATUSES)
  found: Voidable statuses include "submitted" and "rejected". So for an unreimbursed submitted expense, BOTH Reject and Void are available to an admin. The behavioral difference: Reject keeps the expense in the system for resubmission, Void terminates it and reverses any JE.
  implication: Confirms Issue 3 -- for admin viewing a submitted expense, both buttons appear with no guidance on when to pick which.

## Resolution

root_cause: |
  Issue 1: FRAUD-02 receipt hash check in submitExpense (mutations.ts:253-267) is a hard block with no confirmation flow. User cannot reuse a receipt even intentionally (e.g., one receipt with multiple line items for different expense categories).
  Issue 2: listPendingForApproval query returns raw receiptFileId without resolving to URL via ctx.storage.getUrl(). Frontend shows "Receipt attached" badge but no image preview or link.
  Issue 3: ApprovalActions shows both Void and Reject for submitted expenses (admin) with nearly identical dialog descriptions. No guidance on semantic difference (Reject=fix-and-resubmit vs Void=permanent-cancel-with-JE-reversal).

fix: |
  Issue 1: (a) Add pre-check query to detect duplicate hash before submission, (b) show warning with linked expense number at upload time, (c) add "sharedReceiptAcknowledged" flag to schema so user can confirm reuse, (d) modify FRAUD-02 to allow submission when flag is set.
  Issue 2: (a) Add receiptUrl resolution in listPendingForApproval query, (b) make receipt badge clickable to open photo in dialog/lightbox.
  Issue 3: (a) Add clear contextual descriptions to Void and Reject dialogs explaining when to use each, (b) add tooltip to Void button.

verification:
files_changed: []
