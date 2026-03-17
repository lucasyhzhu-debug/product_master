import {
  GuideSection,
  StepCard,
  CalloutBox,
} from "@/components/help";

export function AnalyticsSection() {
  return (
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
  );
}
