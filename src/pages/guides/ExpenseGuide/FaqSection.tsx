import React from "react";
import {
  GuideSection,
  FaqAccordion,
  type FaqGroup,
} from "@/components/help";

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

// Suppress unused import warning -- React is needed for JSX in FULL_FAQ constant
void React;

export function FaqSection() {
  return (
    <GuideSection id="faq" title="FAQ">
      <p className="text-muted-foreground mb-6">
        Frequently asked questions about expenses, approval, reimbursement,
        and payroll.
      </p>
      <FaqAccordion groups={FULL_FAQ} />
    </GuideSection>
  );
}
