import {
  MockFrame,
  MockTable,
  MockBadge,
  MockButton,
} from "./MockElements";
import type { MockPanelProps } from "./types";

export function ApproveExpenseMock({
  currentStep,
  breadcrumb,
}: MockPanelProps) {
  // Step 0: Open queue
  if (currentStep === 0) {
    return (
      <MockFrame breadcrumb={breadcrumb} aria-label="Open approval queue">
        {/* Tab bar */}
        <div className="flex gap-2 mb-4">
          <div className="px-3 py-1.5 rounded-md text-sm text-muted-foreground">
            My Expenses
          </div>
          <div className="px-3 py-1.5 rounded-md text-sm bg-primary/10 text-primary font-medium border-2 border-indigo-400">
            Approval
          </div>
        </div>
        <MockTable
          headers={["Employee", "Description", "Amount", "Status", "Flags"]}
          rows={[
            ["Sari", "Office supplies", "Rp 150,000", "Submitted", ""],
            ["Budi", "Transport", "Rp 75,000", "Submitted", ""],
            ["Rina", "Client lunch", "Rp 320,000", "Submitted", ""],
          ]}
          highlightRow={0}
        />
        <div className="mt-2 flex gap-2">
          <div className="text-xs text-muted-foreground">Row 1:</div>
          <MockBadge variant="warning">Late</MockBadge>
          <div className="text-xs text-muted-foreground">Row 2:</div>
          <MockBadge variant="error">Duplicate</MockBadge>
        </div>
      </MockFrame>
    );
  }

  // Step 1: Review
  if (currentStep === 1) {
    return (
      <MockFrame breadcrumb={breadcrumb} aria-label="Review expense detail">
        <div className="rounded-lg border p-4 border-2 border-indigo-400 shadow-[0_0_0_4px_rgba(99,102,241,0.15)]">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm">Office supplies</h4>
            <MockBadge variant="warning">Late Submission</MockBadge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Employee:</span> Sari
            </div>
            <div>
              <span className="text-muted-foreground">Amount:</span> Rp 150,000
            </div>
            <div>
              <span className="text-muted-foreground">GL Category:</span> 6500
            </div>
            <div>
              <span className="text-muted-foreground">Vendor:</span> Toko Sukses
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
              IMG
            </div>
            <span className="text-xs text-muted-foreground">receipt.jpg</span>
          </div>
        </div>
      </MockFrame>
    );
  }

  // Step 2: Approve/reject
  return (
    <MockFrame breadcrumb={breadcrumb} aria-label="Approve or reject expense">
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm">Office supplies</h4>
          <MockBadge variant="warning">Late Submission</MockBadge>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div>
            <span className="text-muted-foreground">Employee:</span> Sari
          </div>
          <div>
            <span className="text-muted-foreground">Amount:</span> Rp 150,000
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-end gap-3">
          <MockButton variant="primary" highlighted>
            Approve
          </MockButton>
          <MockButton variant="destructive" highlighted>
            Reject
          </MockButton>
        </div>
        <div className="rounded-md border border-input p-2 text-xs text-muted-foreground">
          Rejection reason (required if rejecting)...
        </div>
      </div>
    </MockFrame>
  );
}
