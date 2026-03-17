import {
  GuideSection,
  WalkthroughPlayer,
  type WalkthroughWorkflow,
} from "@/components/help";
import { SubmitExpenseMock } from "@/components/help/walkthrough/SubmitMocks";
import { ApproveExpenseMock } from "@/components/help/walkthrough/ApproveMocks";
import { ReimburseMock } from "@/components/help/walkthrough/ReimburseMocks";

const EXPENSE_WORKFLOWS: WalkthroughWorkflow[] = [
  {
    id: "submit",
    label: "Submit an Expense",
    getBreadcrumb: (step: number) =>
      step === 0 ? "Financials > Expenses" : "Financials > Expenses > New Expense",
    steps: [
      {
        id: "navigate",
        title: "Go to Expenses",
        description: "Open the Financials dropdown in the top menu, then click Expenses. Tap the New Expense button to start.",
      },
      {
        id: "fill-details",
        title: "Fill in the details",
        description: "Enter a description, amount in IDR, GL category, expense date, and vendor name. The payment method determines whether this goes through reimbursement (personal) or is recorded directly (company card).",
        tip: "Use 6990 Miscellaneous OpEx if unsure about the GL category.",
      },
      {
        id: "attach-receipt",
        title: "Attach a receipt",
        description: "Take a photo or upload an image of the receipt. Required for amounts over Rp 50,000.",
        warning: "Expenses over Rp 50,000 without a receipt may be rejected.",
      },
      {
        id: "save-submit",
        title: "Save or submit",
        description: "Save Draft keeps the expense editable. Submit sends it to the approval queue \u2014 you cannot edit after submitting.",
        tip: "Need to fix something after submitting? Ask your approver to reject it so you can revise and resubmit.",
      },
    ],
    mockComponent: SubmitExpenseMock,
  },
  {
    id: "approve",
    label: "Approve an Expense",
    getBreadcrumb: (step: number) =>
      step === 0 ? "Financials > Expenses > Approval" : "Financials > Expenses > Approval > Detail",
    steps: [
      {
        id: "open-queue",
        title: "Open approval queue",
        description: "Open the Financials dropdown, click Expenses. The Approval tab shows expenses waiting for your review. Managers and admins only \u2014 you won\u2019t see expenses you submitted yourself.",
      },
      {
        id: "review",
        title: "Review the expense",
        description: "Check the amount, receipt, GL category, and vendor. Look for fraud badges: Duplicate Warning, Late Submission, or high rejection count.",
        warning: "A comment is required when approving expenses of Rp 500,000 or more.",
      },
      {
        id: "approve-reject",
        title: "Approve or reject",
        description: "Approve moves the expense forward. Reject requires a reason the submitter will see. They can revise and resubmit.",
        tip: "See a Duplicate Warning badge? Check the linked expense before approving \u2014 it might be a genuine separate purchase.",
      },
    ],
    mockComponent: ApproveExpenseMock,
  },
  {
    id: "reimburse",
    label: "Reimburse",
    getBreadcrumb: (step: number) =>
      step === 0 ? "Financials > Reimburse" : "Financials > Reimburse > Batch RMB-0315-001",
    steps: [
      {
        id: "open-reimburse",
        title: "Open Reimbursement",
        description: "Open the Financials dropdown, click Reimburse. This page is admin only.",
      },
      {
        id: "review-pending",
        title: "Review pending",
        description: "Approved personal expenses are grouped by employee with running totals. Review the amounts before creating a batch.",
      },
      {
        id: "create-batch",
        title: "Create batch",
        description: "Select expenses for one employee and click Create Batch. The system generates a batch code (RMB-MMDD-NNN) for bank transfer tracking.",
      },
      {
        id: "transfer",
        title: "Transfer via bank",
        description: "Open BCA mobile and transfer the batch total to the employee. Use the RMB code in the transfer notes so you can match it later.",
      },
      {
        id: "confirm",
        title: "Confirm batch",
        description: "Back in the app, enter the BCA reference number, select the source bank account, and set the transfer date.",
      },
      {
        id: "done",
        title: "Done",
        description: "All linked expenses in the batch are marked Reimbursed. The employee can see the status update immediately.",
        tip: "If the bank transfer fails, you can void the entire batch \u2014 this returns all expenses to Approved so they can be re-batched.",
      },
    ],
    mockComponent: ReimburseMock,
  },
];

export function WalkthroughSection() {
  return (
    <>
      {/* Redirect anchors for old deep links (Phase 63 migration) */}
      <div id="submitting" className="sr-only" aria-hidden="true" />
      <div id="approving" className="sr-only" aria-hidden="true" />
      <div id="reimbursement" className="sr-only" aria-hidden="true" />

      <GuideSection id="walkthrough" title="Interactive Walkthroughs">
        <p className="text-muted-foreground mb-6">
          Click through each workflow to see exactly where to go and what to do.
          Use the tabs to switch between Submit, Approve, and Reimburse.
        </p>
        <WalkthroughPlayer workflows={EXPENSE_WORKFLOWS} />
      </GuideSection>
    </>
  );
}
