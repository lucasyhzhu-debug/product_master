/**
 * Phase 73 Plan 03 Wave 0 — RED test stub for ReconciliationActionBar.
 *
 * Validates BANK-03 action bar contract: Match/Unmatch/Confirm enablement,
 * CapEx button-swap, inline-create visibility for unmatched lines.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ReconciliationActionBar } from "../ReconciliationActionBar";

const NOOP = () => {};

const baseProps = {
  selectedLine: null as never,
  selectedCandidate: null as never,
  onMatch: NOOP,
  onUnmatch: NOOP,
  onConfirm: NOOP,
  onBatchConfirm: NOOP,
  onSearchAll: NOOP,
  onRouteToAssetRegister: NOOP,
  onInlineCreateExpense: NOOP,
  onInlineCreateRevenue: NOOP,
  onInlineCreateReimbursement: NOOP,
};

describe("ReconciliationActionBar — Phase 73 BANK-03", () => {
  it("disables [Match selected] when selectedCandidate is null", () => {
    render(
      <ReconciliationActionBar
        {...baseProps}
        selectedLine={
          {
            _id: "line1",
            status: "suggested",
            matchedType: undefined,
            flags: [],
          } as never
        }
        selectedCandidate={null as never}
      />,
    );

    const btn = screen.getByRole("button", { name: /Match selected/i });
    expect(btn).toBeDisabled();
  });

  it("replaces [Confirm] with [Route to Asset Register] when selectedLine.flags includes capex_needs_asset_register", () => {
    render(
      <ReconciliationActionBar
        {...baseProps}
        selectedLine={
          {
            _id: "line1",
            status: "suggested",
            matchedType: "expense",
            jeDebitAccountId: "acct1",
            jeCreditAccountId: "acct2",
            flags: ["capex_needs_asset_register"],
          } as never
        }
        selectedCandidate={null as never}
      />,
    );

    expect(screen.getByRole("button", { name: /Route to Asset Register/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Confirm$/i })).not.toBeInTheDocument();
  });

  it("disables [Unmatch auto] when selected line has no matchedType", () => {
    render(
      <ReconciliationActionBar
        {...baseProps}
        selectedLine={
          {
            _id: "line1",
            status: "unmatched",
            matchedType: undefined,
            flags: [],
          } as never
        }
        selectedCandidate={null as never}
      />,
    );

    const btn = screen.getByRole("button", { name: /Unmatch auto/i });
    expect(btn).toBeDisabled();
  });

  it("inline-create buttons appear only when selectedLine.status === 'unmatched'", () => {
    const { rerender } = render(
      <ReconciliationActionBar
        {...baseProps}
        selectedLine={
          {
            _id: "line1",
            status: "unmatched",
            matchedType: undefined,
            flags: [],
          } as never
        }
        selectedCandidate={null as never}
      />,
    );

    expect(screen.getByRole("button", { name: /Create expense/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create revenue/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create reimbursement/i })).toBeInTheDocument();

    rerender(
      <ReconciliationActionBar
        {...baseProps}
        selectedLine={
          {
            _id: "line1",
            status: "suggested",
            matchedType: "expense",
            flags: [],
          } as never
        }
        selectedCandidate={null as never}
      />,
    );

    expect(screen.queryByRole("button", { name: /Create expense/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create revenue/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create reimbursement/i })).not.toBeInTheDocument();
  });
});
