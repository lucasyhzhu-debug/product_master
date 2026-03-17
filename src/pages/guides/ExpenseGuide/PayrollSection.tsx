import {
  GuideSection,
  StepCard,
  CalloutBox,
  FaqAccordion,
  type FaqGroup,
} from "@/components/help";

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

export function PayrollSection() {
  return (
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
  );
}
