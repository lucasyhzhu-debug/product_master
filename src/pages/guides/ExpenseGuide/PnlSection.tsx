import {
  GuideSection,
  WorkflowDiagram,
  StepCard,
  type FlowNode,
  type FlowEdge,
} from "@/components/help";

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

export function PnlSection() {
  return (
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
  );
}
