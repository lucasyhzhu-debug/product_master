import { Check } from "lucide-react";
import {
  HIGHLIGHT_CLASSES,
  MockFrame,
  MockNavDropdown,
  MockButton,
  MockInput,
  MockSelect,
} from "./MockElements";
import { cn } from "@/lib/utils";
import type { MockPanelProps } from "./types";

export function ReimburseMock({ currentStep, breadcrumb }: MockPanelProps) {
  // Step 0: Open
  if (currentStep === 0) {
    return (
      <MockFrame breadcrumb={breadcrumb} aria-label="Open reimbursement page">
        <MockNavDropdown activeItem="Reimburse" highlighted />
        <div className="mt-4 text-sm font-semibold">
          Reimbursement Manager
        </div>
      </MockFrame>
    );
  }

  // Step 1: Review pending
  if (currentStep === 1) {
    return (
      <MockFrame breadcrumb={breadcrumb} aria-label="Review pending expenses">
        <div className="space-y-3">
          <div className={cn("rounded-lg border p-3", HIGHLIGHT_CLASSES)}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Sari</span>
              <span className="text-sm">Rp 450,000</span>
            </div>
            <span className="text-xs text-muted-foreground">3 expenses</span>
          </div>
          <div className={cn("rounded-lg border p-3", HIGHLIGHT_CLASSES)}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Budi</span>
              <span className="text-sm">Rp 150,000</span>
            </div>
            <span className="text-xs text-muted-foreground">1 expense</span>
          </div>
        </div>
      </MockFrame>
    );
  }

  // Step 2: Create batch
  if (currentStep === 2) {
    return (
      <MockFrame breadcrumb={breadcrumb} aria-label="Create reimbursement batch">
        <div className="space-y-2">
          <div className="text-sm font-medium mb-2">
            Sari &mdash; 3 expenses
          </div>
          {["Office supplies - Rp 150,000", "Transport - Rp 200,000", "Printing - Rp 100,000"].map(
            (item) => (
              <div
                key={item}
                className="flex items-center gap-2 text-xs p-2 rounded border"
              >
                <div className="w-4 h-4 rounded border bg-primary flex items-center justify-center">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
                {item}
              </div>
            )
          )}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              RMB-0315-001
            </span>
            <MockButton variant="primary" highlighted>
              Create Batch
            </MockButton>
          </div>
        </div>
      </MockFrame>
    );
  }

  // Step 3: Transfer
  if (currentStep === 3) {
    return (
      <MockFrame breadcrumb={breadcrumb} aria-label="Transfer via bank">
        <div className="space-y-3">
          <div className="rounded-lg border p-3">
            <div className="text-sm font-medium">Batch RMB-0315-001</div>
            <div className="text-xs text-muted-foreground">
              Total: Rp 450,000
            </div>
          </div>
          <div className={cn("rounded-lg border p-3", HIGHLIGHT_CLASSES)}>
            <div className="text-xs font-medium mb-1">Transfer Instructions</div>
            <p className="text-xs text-muted-foreground">
              Open BCA Mobile, transfer Rp 450,000 with reference RMB-0315-001
            </p>
          </div>
        </div>
      </MockFrame>
    );
  }

  // Step 4: Confirm
  if (currentStep === 4) {
    return (
      <MockFrame breadcrumb={breadcrumb} aria-label="Confirm batch payment">
        <div className="space-y-3">
          <MockInput label="BCA Reference" highlighted />
          <MockSelect
            label="Source Account"
            value="BCA Operating"
            highlighted
          />
          <MockInput label="Transfer Date" highlighted />
        </div>
      </MockFrame>
    );
  }

  // Step 5: Done
  return (
    <MockFrame breadcrumb={breadcrumb} aria-label="Reimbursement complete">
      <div className={cn("rounded-lg border p-4", HIGHLIGHT_CLASSES)}>
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <div className="text-center">
            <div className="font-semibold text-sm">
              3 expenses marked Reimbursed
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Batch RMB-0315-001 &middot; Rp 450,000
            </div>
          </div>
        </div>
      </div>
    </MockFrame>
  );
}
