/**
 * Phase 79 Wave 0 — Plan 01 Task 2
 *
 * Failing component tests for BigSellerSyncPanel's new admin actions.
 *
 * Wave 3 (Plan 07 Task 2) will add two buttons ("Backfill historical items",
 * "Re-check empty rows") wired to useBackfillBigsellerItems /
 * useRescanEmptyRows hooks. Until then these tests fail red because the
 * strings don't exist in the component.
 *
 * Anchor: DA-10 (backfill) + DA-13 (re-check).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BigSellerSyncPanel } from "../BigSellerSyncPanel";

// Mock Convex hooks — these are what Plan 07 Task 2 will add/use.
const backfillMock = vi.fn();
const rescanMock = vi.fn();

vi.mock("../../../hooks/convex/useBigSellerSync", () => ({
  useBigSellerSync: () => ({
    triggerSync: vi.fn(),
    syncState: { stage: "idle" },
    isRunning: false,
  }),
  // Hooks that Plan 07 Task 2 will add — red until wired.
  useBackfillBigsellerItems: () => backfillMock,
  useRescanEmptyRows: () => rescanMock,
}));

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn(() => "toast-id"),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

describe("BigSellerSyncPanel — Phase 79 Plan 07 T2", () => {
  beforeEach(() => {
    backfillMock.mockReset();
    rescanMock.mockReset();
  });

  it("renders the 'Backfill historical items' button", () => {
    render(<BigSellerSyncPanel />);
    expect(screen.getByText("Backfill historical items")).toBeInTheDocument();
  });

  it("renders the 'Re-check empty rows' button", () => {
    render(<BigSellerSyncPanel />);
    expect(screen.getByText("Re-check empty rows")).toBeInTheDocument();
  });

  it("calls useBackfillBigsellerItems when 'Backfill historical items' is clicked", async () => {
    const user = userEvent.setup();
    backfillMock.mockResolvedValue({ created: 10, skipped: 0 });

    render(<BigSellerSyncPanel />);
    await user.click(screen.getByRole("button", { name: /Backfill historical items/i }));

    expect(backfillMock).toHaveBeenCalledTimes(1);
  });

  it("disables the backfill button while the mutation is in flight", async () => {
    const user = userEvent.setup();
    // Never-resolving promise simulates in-flight state.
    backfillMock.mockImplementation(() => new Promise(() => {}));

    render(<BigSellerSyncPanel />);
    const btn = screen.getByRole("button", { name: /Backfill historical items/i });
    await user.click(btn);

    expect(btn).toBeDisabled();
  });
});
