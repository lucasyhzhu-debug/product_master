import {
  GuideLayout,
  GuideSection,
  WorkflowDiagram,
  StepCard,
  CalloutBox,
  FaqAccordion,
  type FlowNode,
  type FlowEdge,
  type FaqGroup,
} from "@/components/help";

// ---------------------------------------------------------------------------
// Guide metadata (mirrors registry entry to avoid circular import)
// ---------------------------------------------------------------------------

const GUIDE_TITLE = "Expenses & Reimbursement";
const GUIDE_DESCRIPTION =
  "Submit expenses, approve reimbursements, understand payroll integration and P&L impact.";
const GUIDE_READ_TIME = 15;
const GUIDE_SECTIONS = [
  { id: "overview", title: "Overview" },
  { id: "submitting", title: "Submitting Expenses" },
  { id: "approving", title: "Approving Expenses" },
  { id: "reimbursement", title: "Reimbursement Workflow" },
  { id: "payroll", title: "Payroll Integration" },
  { id: "analytics", title: "Expense Analytics" },
  { id: "pnl", title: "P&L Impact" },
  { id: "faq", title: "FAQ" },
];

// ---------------------------------------------------------------------------
// Section 1: Overview -- Lifecycle flowchart data
// ---------------------------------------------------------------------------

const LIFECYCLE_NODES: FlowNode[] = [
  { id: "draft", label: "Draft", color: "gray" },
  { id: "submitted", label: "Submitted", color: "blue" },
  { id: "approved", label: "Approved", color: "green" },
  { id: "awaiting", label: "Awaiting Payment", color: "amber" },
  { id: "reimbursed", label: "Reimbursed", color: "green" },
  { id: "rejected", label: "Rejected", color: "red" },
  { id: "voided", label: "Voided", color: "red" },
];

const LIFECYCLE_EDGES: FlowEdge[] = [
  { from: "draft", to: "submitted" },
  { from: "submitted", to: "approved" },
  { from: "approved", to: "awaiting" },
  { from: "awaiting", to: "reimbursed" },
  { from: "submitted", to: "rejected", label: "Reject", style: "dashed" },
  {
    from: "rejected",
    to: "submitted",
    label: "Revise & Resubmit",
    style: "dashed",
  },
];

// ---------------------------------------------------------------------------
// Section 2: Submitting -- Mini FAQ data
// ---------------------------------------------------------------------------

const SUBMITTING_FAQ: FaqGroup[] = [
  {
    title: "Common Questions",
    items: [
      {
        question: "How do I pick the right GL category?",
        answer:
          "Choose the category that best describes the expense. For example, use 5100 for raw materials, 6100 for rent, or 6500 for general operating expenses. If nothing fits, use 6990 Miscellaneous OpEx and your approver can ask you to correct it.",
      },
      {
        question: "Do I always need a receipt?",
        answer:
          "Receipts are required for any expense over Rp 50,000. For smaller amounts a receipt is optional but recommended. Digital photos of paper receipts are accepted.",
      },
      {
        question: "What happens if I submit a duplicate?",
        answer:
          "The system checks for expenses with the same amount, vendor, and date. If a potential duplicate is found, you will see a soft warning. You can still submit if it is genuinely a separate expense.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Section 3: Approving -- DoA workflow data
// ---------------------------------------------------------------------------

const DOA_NODES: FlowNode[] = [
  { id: "arrives", label: "Expense Arrives in Queue", color: "blue" },
  { id: "check", label: "Amount Check", color: "amber" },
  { id: "manager", label: "Manager or Admin Reviews", color: "blue" },
  { id: "admin", label: "Admin Only Reviews", color: "amber" },
  { id: "decision", label: "Approve or Reject", color: "green" },
  { id: "personal", label: "Awaiting Payment", color: "amber" },
  { id: "terminal", label: "Approved (Terminal)", color: "green" },
];

const DOA_EDGES: FlowEdge[] = [
  { from: "arrives", to: "check" },
  { from: "check", to: "manager", label: "<=500K" },
  { from: "check", to: "admin", label: ">500K" },
  { from: "manager", to: "decision" },
  { from: "admin", to: "decision" },
  { from: "decision", to: "personal", label: "Personal" },
  { from: "decision", to: "terminal", label: "Company Card" },
];

// ---------------------------------------------------------------------------
// Section 4: Reimbursement -- Batch workflow data
// ---------------------------------------------------------------------------

const BATCH_NODES: FlowNode[] = [
  { id: "pool", label: "Approved Expenses Pool", color: "green" },
  { id: "group", label: "Group by Employee", color: "blue" },
  { id: "batch", label: "Create Batch", color: "blue" },
  { id: "transfer", label: "Transfer via BCA", color: "amber" },
  { id: "reference", label: "Enter Reference + Date", color: "blue" },
  { id: "confirm", label: "Confirm Batch", color: "blue" },
  { id: "done", label: "Expenses Reimbursed", color: "green" },
];

const BATCH_EDGES: FlowEdge[] = [
  { from: "pool", to: "group" },
  { from: "group", to: "batch", label: "RMB-MMDD-NNN" },
  { from: "batch", to: "transfer" },
  { from: "transfer", to: "reference" },
  { from: "reference", to: "confirm" },
  { from: "confirm", to: "done" },
];

// ---------------------------------------------------------------------------
// Section 5: Payroll -- Mini FAQ data
// ---------------------------------------------------------------------------

const PAYROLL_FAQ: FaqGroup[] = [
  {
    title: "Payroll Questions",
    items: [
      {
        question:
          "Do I need a Frollie user account for each staff member to use payroll?",
        answer:
          "No. Payroll entries are financial records. Recipient name is free text. Only people who log in need accounts.",
      },
      {
        question: "Are payroll accounts and expense accounts separate?",
        answer:
          "Yes. Payroll (6100) is direct recording by admin. Expenses are claim-based with approval. Independent systems feeding into P&L.",
      },
      {
        question: "How do I handle leave or partial months?",
        answer: "Calculate pro-rata yourself. Enter final amount.",
      },
      {
        question: "Can I attach a payroll slip?",
        answer:
          "Yes, optional attachment upload for PDFs or images.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Section 7: P&L -- Journal entry flow data
// ---------------------------------------------------------------------------

const PNL_NODES: FlowNode[] = [
  { id: "submit", label: "Submit Expense", color: "blue" },
  { id: "approve", label: "Manager Approves", color: "green" },
  { id: "journal", label: "Auto Journal Entry", color: "amber" },
  { id: "statement", label: "Financial Statement", color: "blue" },
  { id: "reduces", label: "Reduces EBIT & Net Income", color: "green" },
];

const PNL_EDGES: FlowEdge[] = [
  { from: "submit", to: "approve" },
  { from: "approve", to: "journal", label: "DR 6500, CR 2200" },
  { from: "journal", to: "statement", label: "Operating Expenses" },
  { from: "statement", to: "reduces" },
];

// ---------------------------------------------------------------------------
// Section 8: FAQ -- Full accordion data (5 groups, 16 questions)
// ---------------------------------------------------------------------------

const FULL_FAQ: FaqGroup[] = [
  {
    title: "General",
    items: [
      {
        question:
          "Do I need a Frollie Pro account to have a payroll account, or are they separate?",
        answer: (
          <p>
            There is no &ldquo;Frollie Pro.&rdquo; All features are available
            based on role. Payroll is admin-only.
          </p>
        ),
      },
      {
        question: "Who can see my expenses?",
        answer:
          "You see your own. Managers and admins see submitted expenses in the approval queue. Admins can see all.",
      },
      {
        question: "What does 'voided' mean?",
        answer:
          "Entry cancelled, accounting impact reversed. Original stays for audit but has no financial effect.",
      },
      {
        question: "Can I delete an expense?",
        answer:
          "No. You can void it (admin only). Deletion not supported for audit trail integrity.",
      },
    ],
  },
  {
    title: "Submission",
    items: [
      {
        question: "What payment method should I choose?",
        answer:
          "Personal Cash/Transfer if you paid from your own money (reimbursed). Company Card if used company bank card (no reimbursement).",
      },
      {
        question:
          "I forgot to submit an expense from 3 weeks ago, is it too late?",
        answer: (
          <p>
            No, but it gets a &ldquo;Late Submission&rdquo; flag. Not blocked.
          </p>
        ),
      },
      {
        question: "Can I submit expenses in foreign currency?",
        answer:
          "Not yet. All amounts in IDR. Convert using exchange rate on expense date.",
      },
    ],
  },
  {
    title: "Approval",
    items: [
      {
        question:
          "Why can't I see some expenses in my approval queue?",
        answer: (
          <p>
            Managers only approve &le;500K. Higher needs admin. You cannot
            approve your own expenses.
          </p>
        ),
      },
      {
        question: "What do the fraud warning badges mean?",
        answer:
          "See the Expense Analytics section above for detailed explanations of each flag.",
      },
      {
        question: "I rejected an expense by mistake. What do I do?",
        answer:
          "The submitter can revise and resubmit. You will see the full rejection history when reviewing.",
      },
    ],
  },
  {
    title: "Reimbursement",
    items: [
      {
        question: "What if the bank transfer fails?",
        answer:
          "Void the batch. Creates reversing entry, returns expenses to pending. Re-batch and try again.",
      },
      {
        question:
          "Can I combine expenses from different employees in one batch?",
        answer:
          "No. One batch per employee. System enforces this.",
      },
      {
        question: "How does the submitter know they've been reimbursed?",
        answer: (
          <p>
            Expense status changes to &ldquo;Reimbursed&rdquo; (real-time
            update).
          </p>
        ),
      },
    ],
  },
  {
    title: "Payroll",
    items: [
      {
        question: "Do staff members need Frollie accounts?",
        answer:
          "No. Payroll entries are financial records. Recipient name is free text.",
      },
      {
        question: "How do I handle pro-rata pay?",
        answer: "Calculate yourself. Enter final amount.",
      },
      {
        question:
          "What's the difference between Staff and Contractor?",
        answer: (
          <p>
            Classification for reporting. Both create same JE (DR 6100, CR
            1100).
          </p>
        ),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExpenseGuide() {
  return (
    <GuideLayout
      title={GUIDE_TITLE}
      description={GUIDE_DESCRIPTION}
      sections={GUIDE_SECTIONS}
      readTimeMinutes={GUIDE_READ_TIME}
    >
      {/* ================================================================= */}
      {/* Section 1: Overview                                               */}
      {/* ================================================================= */}
      <GuideSection id="overview" title="Overview">
        <p className="text-muted-foreground mb-6">
          The expense system lets anyone on the team submit expense claims, which
          managers and admins approve. Approved personal expenses get batched
          into reimbursement transfers. Payroll records staff and contractor
          payments. Everything auto-generates accounting entries that flow to the
          P&L.
        </p>

        <WorkflowDiagram
          nodes={LIFECYCLE_NODES}
          edges={LIFECYCLE_EDGES}
          title="Expense Lifecycle"
        />

        <p className="text-sm text-muted-foreground mt-4 mb-8">
          Company card expenses skip Awaiting Payment&mdash;Approved is terminal.
          Any non-terminal expense can be Voided by an admin.
        </p>

        <h3 className="text-lg font-semibold mb-4">Role Summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium">Action</th>
                <th className="text-center py-2 px-3 font-medium">Kitchen</th>
                <th className="text-center py-2 px-3 font-medium">
                  Order Staff
                </th>
                <th className="text-center py-2 px-3 font-medium">Manager</th>
                <th className="text-center py-2 px-3 font-medium">Admin</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 px-3">Submit expenses</td>
                <td className="text-center py-2 px-3">Yes</td>
                <td className="text-center py-2 px-3">Yes</td>
                <td className="text-center py-2 px-3">Yes</td>
                <td className="text-center py-2 px-3">Yes</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3">Approve &le;500K</td>
                <td className="text-center py-2 px-3">&mdash;</td>
                <td className="text-center py-2 px-3">&mdash;</td>
                <td className="text-center py-2 px-3">Yes</td>
                <td className="text-center py-2 px-3">Yes</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3">Approve &gt;500K</td>
                <td className="text-center py-2 px-3">&mdash;</td>
                <td className="text-center py-2 px-3">&mdash;</td>
                <td className="text-center py-2 px-3">&mdash;</td>
                <td className="text-center py-2 px-3">Yes</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3">Reimbursement batching</td>
                <td className="text-center py-2 px-3">&mdash;</td>
                <td className="text-center py-2 px-3">&mdash;</td>
                <td className="text-center py-2 px-3">&mdash;</td>
                <td className="text-center py-2 px-3">Yes</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3">Payroll entry</td>
                <td className="text-center py-2 px-3">&mdash;</td>
                <td className="text-center py-2 px-3">&mdash;</td>
                <td className="text-center py-2 px-3">&mdash;</td>
                <td className="text-center py-2 px-3">Yes</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3">View analytics</td>
                <td className="text-center py-2 px-3">&mdash;</td>
                <td className="text-center py-2 px-3">&mdash;</td>
                <td className="text-center py-2 px-3">Yes</td>
                <td className="text-center py-2 px-3">Yes</td>
              </tr>
            </tbody>
          </table>
        </div>
      </GuideSection>

      {/* ================================================================= */}
      {/* Section 2: Submitting Expenses                                    */}
      {/* ================================================================= */}
      <GuideSection id="submitting" title="Submitting Expenses" role="all">
        <p className="text-muted-foreground mb-6">
          Any staff member can submit expense claims for approval. Here is how
          to create and submit an expense.
        </p>

        <div className="space-y-0">
          <StepCard
            step={1}
            title="Go to Expenses"
            description='Open the Financials dropdown in the top menu, click Expenses. Then tap the "New Expense" button.'
          />
          <StepCard
            step={2}
            title="Fill in the details"
            description="Enter a description, amount (IDR), GL category, expense date, vendor name, and payment method (personal cash, personal transfer, or company card)."
          />
          <StepCard
            step={3}
            title="Attach a receipt"
            description="Take a photo or upload an image. Required for amounts over Rp 50,000."
          />
          <StepCard
            step={4}
            title="Save as draft or submit"
            description="Save Draft keeps it editable. Submit sends it to the approval queue."
            isLast
          />
        </div>

        <div className="mt-8 space-y-4">
          <CalloutBox type="tip">
            If you are not sure about the GL category, use 6990 Miscellaneous
            OpEx. Your approver can ask you to correct it before approval.
          </CalloutBox>
          <CalloutBox type="warning">
            Expenses submitted more than 14 days after the expense date get
            flagged as &ldquo;Late Submission.&rdquo;
          </CalloutBox>
          <CalloutBox type="important">
            Once submitted, you cannot edit the expense. Ask your approver to
            reject it so you can revise and resubmit.
          </CalloutBox>
        </div>

        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Common Questions</h3>
          <FaqAccordion groups={SUBMITTING_FAQ} />
        </div>
      </GuideSection>

      {/* ================================================================= */}
      {/* Section 3: Approving Expenses                                     */}
      {/* ================================================================= */}
      <GuideSection id="approving" title="Approving Expenses" role="manager">
        <p className="text-muted-foreground mb-6">
          Managers can approve expenses up to Rp 500,000. Amounts above that
          require admin approval. The delegation of authority (DoA) workflow
          routes expenses automatically.
        </p>

        <WorkflowDiagram
          nodes={DOA_NODES}
          edges={DOA_EDGES}
          title="Delegation of Authority"
        />

        <div className="mt-8 space-y-0">
          <StepCard
            step={1}
            title="Open approval queue"
            description="Open the Financials dropdown, click Expenses. The approval tab shows pending expenses. Managers and admins only; you will not see expenses you submitted yourself."
          />
          <StepCard
            step={2}
            title="Review the expense"
            description="Check amount, receipt, GL category, and vendor. Look for fraud badges such as duplicate, late submission, or high rejection count."
          />
          <StepCard
            step={3}
            title="Approve or reject"
            description="Approve moves the expense forward. Reject requires a reason the submitter will see."
            isLast
          />
        </div>

        <div className="mt-8 space-y-4">
          <CalloutBox type="important">
            You cannot approve your own expenses. They must be reviewed by
            another manager or admin.
          </CalloutBox>
          <CalloutBox type="warning">
            A comment is required when approving expenses of Rp 500,000 or more.
          </CalloutBox>
          <CalloutBox type="tip">
            See a &ldquo;Duplicate Warning&rdquo; badge? Check the linked
            expense before approving. It might be a genuine separate purchase or
            a true duplicate.
          </CalloutBox>
        </div>
      </GuideSection>

      {/* ================================================================= */}
      {/* Section 4: Reimbursement Workflow                                  */}
      {/* ================================================================= */}
      <GuideSection
        id="reimbursement"
        title="Reimbursement Workflow"
        role="admin"
      >
        <p className="text-muted-foreground mb-6">
          Approved personal expenses are batched per employee and reimbursed via
          bank transfer. Only admins can manage reimbursement batches.
        </p>

        <WorkflowDiagram
          nodes={BATCH_NODES}
          edges={BATCH_EDGES}
          title="Reimbursement Batch Workflow"
        />

        <div className="mt-8 space-y-0">
          <StepCard
            step={1}
            title="Open Reimbursement Manager"
            description="Open the Financials dropdown, click Reimburse. This page is admin only."
          />
          <StepCard
            step={2}
            title="Review pending expenses"
            description="Expenses are grouped by employee with running totals. Review the list before creating a batch."
          />
          <StepCard
            step={3}
            title="Create a batch"
            description="Select expenses for one employee and click Create Batch. The system generates a batch code (RMB-MMDD-NNN)."
          />
          <StepCard
            step={4}
            title="Transfer via bank"
            description="Open BCA mobile, transfer the batch total to the employee. Use the RMB code in the transfer notes for tracking."
          />
          <StepCard
            step={5}
            title="Confirm the batch"
            description="Enter the BCA reference number, select the source bank account, and set the transfer date."
          />
          <StepCard
            step={6}
            title="Done"
            description="All linked expenses in the batch are marked Reimbursed. The employee can see the status update immediately."
            isLast
          />
        </div>

        <div className="mt-8 space-y-4">
          <CalloutBox type="tip">
            If the bank transfer fails, you can void the entire batch. This
            returns all expenses to the Approved state so they can be re-batched.
          </CalloutBox>
          <CalloutBox type="important">
            You cannot void individual reimbursed expenses. To undo a
            reimbursement, you must void the entire batch.
          </CalloutBox>
        </div>
      </GuideSection>

      {/* ================================================================= */}
      {/* Section 5: Payroll Integration                                    */}
      {/* ================================================================= */}
      <GuideSection
        id="payroll"
        title="Payroll Integration"
        role="admin"
      >
        <p className="text-muted-foreground mb-6">
          Payroll records staff and contractor payments. Each entry
          auto-generates a journal entry so salary expenses flow directly to
          the P&L. Only admins can create payroll entries.
        </p>

        <div className="space-y-0">
          <StepCard
            step={1}
            title="Open Payroll"
            description="Open the Financials dropdown, click Payroll (admin only)."
          />
          <StepCard
            step={2}
            title="Fill in the form"
            description="Recipient name (free text -- the person does not need a Frollie account), employee type (staff/contractor), frequency (weekly/monthly), amount, period start and end dates, description."
          />
          <StepCard
            step={3}
            title="Review the journal entry preview"
            description="Shows DR 6100 Salaries & Wages, CR 1100 Cash."
          />
          <StepCard
            step={4}
            title="Confirm & create"
            description="Entry is recorded and journal entry is created immediately."
            isLast
          />
        </div>

        <div className="mt-8 space-y-4">
          <CalloutBox type="important">
            Payroll records what you paid&mdash;it does NOT calculate pro-rata
            or deduct leave. You must calculate the amount yourself before
            entering it.
          </CalloutBox>
          <CalloutBox type="tip">
            For pro-rata calculation: (Monthly salary / working days in month)
            &times; days worked. Deduct any unpaid leave days from days worked.
          </CalloutBox>
          <CalloutBox type="warning">
            Payroll entries cannot be edited after creation. If you entered the
            wrong amount, void the entry and create a new one.
          </CalloutBox>
        </div>

        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Payroll Questions</h3>
          <FaqAccordion groups={PAYROLL_FAQ} />
        </div>
      </GuideSection>

      {/* ================================================================= */}
      {/* Section 6: Expense Analytics                                      */}
      {/* ================================================================= */}
      <GuideSection
        id="analytics"
        title="Expense Analytics"
        role="manager"
      >
        <p className="text-muted-foreground mb-6">
          The Expense Analytics dashboard gives managers and admins a
          real-time view of operating expenses, approval metrics, and fraud
          warnings.
        </p>

        <h3 className="text-lg font-semibold mb-4">Dashboard Cards</h3>
        <div className="overflow-x-auto mb-8">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium">Card</th>
                <th className="text-left py-2 px-3 font-medium">
                  What it shows
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 px-3 font-medium">Total OpEx</td>
                <td className="py-2 px-3">
                  Sum of all operating expenses for the selected period, with
                  pie chart by GL category
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-medium">
                  Pending Reimbursement
                </td>
                <td className="py-2 px-3">
                  Total amount awaiting bank transfer + count of pending
                  expenses
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-medium">Avg Approval Time</td>
                <td className="py-2 px-3">
                  Average days from submission to approval
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-medium">Monthly Trend</td>
                <td className="py-2 px-3">
                  6-month line chart of total OpEx
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-medium">Spend by Employee</td>
                <td className="py-2 px-3">
                  Table of who spent how much in the period
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 px-3 font-medium">Fraud Flags</td>
                <td className="py-2 px-3">
                  Active warnings (see below)
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="space-y-0">
          <StepCard
            step={1}
            title="Open Expense Analytics"
            description="Financials > Exp. Analytics (managers and admins only)."
          />
          <StepCard
            step={2}
            title="Select a period"
            description="Use the month picker or switch to custom date range."
          />
          <StepCard
            step={3}
            title="Review the dashboard"
            description="Each card auto-updates in real-time."
            isLast
          />
        </div>

        <h3 className="text-lg font-semibold mt-8 mb-4">
          Fraud Flags Explained
        </h3>
        <div className="space-y-4 mb-6">
          <div className="rounded-lg border p-4">
            <h4 className="font-semibold mb-1">Split Detection</h4>
            <p className="text-sm text-muted-foreground">
              Same person, same category, multiple expenses within 48 hours
              totaling over Rp 500K. Could be splitting a large expense to
              avoid approval limits.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <h4 className="font-semibold mb-1">Approver Concentration</h4>
            <p className="text-sm text-muted-foreground">
              One approver handles over 80% of one employee&rsquo;s expenses.
              Could indicate favoritism or collusion.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <h4 className="font-semibold mb-1">Unfamiliar Vendor</h4>
            <p className="text-sm text-muted-foreground">
              A vendor name that has not appeared in the system in the last 90
              days. Worth a second look.
            </p>
          </div>
        </div>

        <CalloutBox type="warning">
          Fraud flags are warnings, not accusations. Always investigate before
          drawing conclusions.
        </CalloutBox>
      </GuideSection>

      {/* ================================================================= */}
      {/* Section 7: P&L Impact                                             */}
      {/* ================================================================= */}
      <GuideSection id="pnl" title="P&L Impact" role="admin">
        <p className="text-muted-foreground mb-6">
          Every approved expense and payroll entry automatically creates a
          journal entry that shows up on the Profit &amp; Loss statement. Here
          is how the flow works.
        </p>

        <WorkflowDiagram
          nodes={PNL_NODES}
          edges={PNL_EDGES}
          title="Journal Entry Flow"
        />

        <p className="text-muted-foreground mt-6 mb-8">
          Every approved expense automatically creates an accounting entry. You
          do not need to do anything&mdash;it just shows up on the P&amp;L
          under Operating Expenses. The same happens for payroll entries. This
          is how the system tracks where money is going.
        </p>

        <div className="space-y-0">
          <StepCard
            step={1}
            title="View the P&L"
            description="Open the Financials dropdown, click Income Statement."
          />
          <StepCard
            step={2}
            title="Scroll to Operating Expenses"
            description="Below Gross Profit, you will see each OpEx category with the period total."
          />
          <StepCard
            step={3}
            title="Check EBIT and Net Income"
            description="These are calculated automatically from Revenue - COGS - OpEx."
            isLast
          />
        </div>
      </GuideSection>

      {/* ================================================================= */}
      {/* Section 8: FAQ                                                    */}
      {/* ================================================================= */}
      <GuideSection id="faq" title="FAQ">
        <p className="text-muted-foreground mb-6">
          Frequently asked questions about expenses, approval, reimbursement,
          and payroll.
        </p>
        <FaqAccordion groups={FULL_FAQ} />
      </GuideSection>
    </GuideLayout>
  );
}
