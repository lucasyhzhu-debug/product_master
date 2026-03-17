import {
  GuideSection,
  WorkflowDiagram,
  type FlowNode,
  type FlowEdge,
} from "@/components/help";

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

export function OverviewSection() {
  return (
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
  );
}
