import {
  MockFrame,
  MockNavDropdown,
  MockButton,
  MockInput,
  MockSelect,
  MockRow,
  MockUploadZone,
} from "./MockElements";
import type { MockPanelProps } from "./types";

export function SubmitExpenseMock({ currentStep, breadcrumb }: MockPanelProps) {
  // Step 0: Navigate
  if (currentStep === 0) {
    return (
      <MockFrame breadcrumb={breadcrumb} aria-label="Navigate to expenses">
        <MockNavDropdown activeItem="Expenses" highlighted />
        <div className="mt-4 flex items-center gap-3 p-3 rounded-md bg-muted/30">
          <span className="text-sm text-muted-foreground">My Expenses</span>
          <div className="ml-auto">
            <MockButton variant="primary" highlighted>
              New Expense
            </MockButton>
          </div>
        </div>
      </MockFrame>
    );
  }

  // Step 1: Fill details
  if (currentStep === 1) {
    return (
      <MockFrame breadcrumb={breadcrumb} aria-label="Fill expense details">
        <div className="space-y-3">
          <MockInput
            label="Description"
            value="Office supplies for March"
            highlighted
          />
          <MockRow>
            <MockInput label="Amount" value="Rp 150,000" highlighted />
            <MockSelect
              label="GL Category"
              value="6500 General OpEx"
              highlighted
            />
          </MockRow>
          <MockRow>
            <MockInput label="Date" value="2026-03-15" highlighted />
            <MockInput label="Vendor" value="Toko Sukses" highlighted />
          </MockRow>
          <MockSelect
            label="Payment Method"
            value="Personal Cash"
            highlighted
          />
        </div>
      </MockFrame>
    );
  }

  // Step 2: Attach receipt
  if (currentStep === 2) {
    return (
      <MockFrame breadcrumb={breadcrumb} aria-label="Attach receipt">
        <div className="space-y-3">
          <MockInput
            label="Description"
            value="Office supplies for March"
          />
          <MockRow>
            <MockInput label="Amount" value="Rp 150,000" />
            <MockSelect label="GL Category" value="6500 General OpEx" />
          </MockRow>
          <MockRow>
            <MockInput label="Date" value="2026-03-15" />
            <MockInput label="Vendor" value="Toko Sukses" />
          </MockRow>
          <MockSelect label="Payment Method" value="Personal Cash" />
          <div className="mt-2">
            <MockUploadZone hasFile highlighted />
          </div>
        </div>
      </MockFrame>
    );
  }

  // Step 3: Save/submit
  return (
    <MockFrame breadcrumb={breadcrumb} aria-label="Save or submit expense">
      <div className="space-y-3">
        <MockInput
          label="Description"
          value="Office supplies for March"
        />
        <MockRow>
          <MockInput label="Amount" value="Rp 150,000" />
          <MockSelect label="GL Category" value="6500 General OpEx" />
        </MockRow>
        <MockRow>
          <MockInput label="Date" value="2026-03-15" />
          <MockInput label="Vendor" value="Toko Sukses" />
        </MockRow>
        <MockSelect label="Payment Method" value="Personal Cash" />
        <MockUploadZone hasFile />
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        <MockButton variant="ghost" highlighted>
          Save Draft
        </MockButton>
        <MockButton variant="primary" highlighted>
          Submit
        </MockButton>
      </div>
    </MockFrame>
  );
}
